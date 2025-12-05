#!/usr/bin/env bash

# Matrix Synapse + Dashboard + Cloudflare Tunnel 一键部署/启动脚本
# 设计目标：一次跑通，步骤有超时防卡死，systemd 失败会自动回退为直接运行。

set -Eeuo pipefail

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
section() { printf '\n===== %s =====\n' "$*"; }

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${LOG_FILE:-${BASE_DIR}/log.txt}"
RUNTIME_DIR="${BASE_DIR}/.runtime"
: "${NVM_DIR:=${HOME}/.nvm}"
SECRETS_DIR="${RUNTIME_DIR}/secrets"
mkdir -p "${RUNTIME_DIR}" "${SECRETS_DIR}" "$(dirname "${LOG_FILE}")"
cat /dev/null > "${LOG_FILE}"
exec > >(tee "${LOG_FILE}") 2>&1
export PATH="${HOME}/.local/bin:${PATH}"

DATA_DIR="${DATA_DIR:-${BASE_DIR}/synapse-data}"
CONFIG_PATH="${CONFIG_PATH:-${BASE_DIR}/homeserver.generated.yaml}"
LOG_CONFIG_PATH="${LOG_CONFIG_PATH:-${BASE_DIR}/log_config.generated.yaml}"
SYNAPSE_PID_FILE="${RUNTIME_DIR}/synapse.pid"
FALLBACK_CONFIG="${BASE_DIR}/docs/sample_config.yaml"
FALLBACK_LOG_CONFIG="${BASE_DIR}/docs/sample_log_config.yaml"
CF_CONFIG="${CF_CONFIG:-/etc/cloudflared/config.yml}"
CF_CONFIG_FALLBACK="${BASE_DIR}/cloudflared-config.yaml"
CF_TUNNEL_ID="${CF_TUNNEL_ID:-838e2463-3bad-4129-a0a2-63d9abf0f215}"
BACKEND_DIR="${BASE_DIR}/dashboard/backend"
FRONTEND_DIR="${BASE_DIR}/dashboard/frontend"
BOT_DIR="${BASE_DIR}/dashboard/bot"
BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BOT_PORT="${BOT_PORT:-3002}"
SERVER_NAME_DEFAULT="chat.831511.xyz"
PUBLIC_BASEURL_DEFAULT="https://chat.831511.xyz"
DB_USER="${DB_USER:-synapse_user}"
DB_NAME="${DB_NAME:-synapse}"
SIGNING_KEY_PATH_DEFAULT="${SIGNING_KEY_PATH:-${SECRETS_DIR}/${SERVER_NAME_DEFAULT}.signing.key}"
BACKEND_ENV_PATH="${BACKEND_DIR}/.env"
FRONTEND_ENV_PATH="${FRONTEND_DIR}/.env.local"
BOT_ENV_PATH="${BOT_DIR}/.env"
LAN_IP="127.0.0.1"
BIND_ALL_INTERFACES="${BIND_ALL_INTERFACES:-0}"
ENABLE_MINIO_HEALTH="${ENABLE_MINIO_HEALTH:-0}"
MINIO_HEALTH_ENDPOINT="${MINIO_HEALTH_ENDPOINT:-http://127.0.0.1:9000/minio/health/live}"
FORCE_RESTART_SERVICES="${FORCE_RESTART_SERVICES:-1}"
PORT_WAIT_SECONDS="${PORT_WAIT_SECONDS:-20}"
FRONTEND_API_BASE_URL="${FRONTEND_API_BASE_URL:-}"
SYNAPSE_INTERNAL_BASE_URL="${SYNAPSE_INTERNAL_BASE_URL:-}"
BOT_API_BASE_URL="${BOT_API_BASE_URL:-}"
# 每步默认超时时间（秒）；可通过环境变量覆盖，设为 0 表示不限时只记录耗时
TIMEOUT_APT="${TIMEOUT_APT:-600}"
TIMEOUT_SERVICE="${TIMEOUT_SERVICE:-120}"
TIMEOUT_POETRY_INSTALL="${TIMEOUT_POETRY_INSTALL:-1800}"
TIMEOUT_NODE_INSTALL="${TIMEOUT_NODE_INSTALL:-900}"
TIMEOUT_NPM_INSTALL="${TIMEOUT_NPM_INSTALL:-900}"
TIMEOUT_NPM_BUILD="${TIMEOUT_NPM_BUILD:-1200}"
TIMEOUT_SYNAPSE_START="${TIMEOUT_SYNAPSE_START:-300}"
TIMEOUT_HEALTH="${TIMEOUT_HEALTH:-20}"

on_error() {
    warn "脚本在第 ${BASH_LINENO[0]} 行失败，完整日志：${LOG_FILE}"
    warn "常见修复：检查网络、依赖、端口占用、配置路径。详见 HELP.md / SAVE.md / TODO.md。"
}
trap on_error ERR

with_timeout() {
    local seconds="$1" desc="$2"; shift 2
    local start end elapsed status=0
    start="$(date +%s)"
    if [[ "${seconds}" -gt 0 ]]; then
        timeout --foreground "${seconds}" "$@" || status=$?
    else
        "$@" || status=$?
    fi
    end="$(date +%s)"; elapsed=$((end-start))
    if [[ "${status}" -eq 124 ]]; then
        fatal "步骤超时（${seconds}s）：${desc}（耗时 ${elapsed}s）"
    elif [[ "${status}" -ne 0 ]]; then
        fatal "步骤失败（${desc}），耗时 ${elapsed}s，退出码 ${status}"
    else
        info "步骤完成：${desc}，耗时 ${elapsed}s"
    fi
}

with_timeout_allow_fail() {
    local seconds="$1" desc="$2"; shift 2
    local start end elapsed status=0
    start="$(date +%s)"
    if [[ "${seconds}" -gt 0 ]]; then
        timeout --foreground "${seconds}" "$@" || status=$?
    else
        "$@" || status=$?
    fi
    end="$(date +%s)"; elapsed=$((end-start))
    if [[ "${status}" -eq 124 ]]; then
        warn "步骤超时（${seconds}s）：${desc}（耗时 ${elapsed}s）"
    elif [[ "${status}" -ne 0 ]]; then
        warn "步骤失败（${desc}），耗时 ${elapsed}s，退出码 ${status}"
    else
        info "步骤完成：${desc}，耗时 ${elapsed}s"
    fi
    return "${status}"
}

stop_stale_pid() {
    local pid_file="$1" desc="$2"
    if [[ -f "${pid_file}" ]]; then
        local pid
        pid="$(cat "${pid_file}" 2>/dev/null || true)"
        if [[ -n "${pid}" && "${pid}" =~ ^[0-9]+$ ]]; then
            if ps -p "${pid}" >/dev/null 2>&1; then
                warn "${desc} 已在运行 (pid=${pid})，跳过重复启动。"
                return 1
            else
                warn "发现陈旧 pid 文件 ${pid_file}，已清理。"
                rm -f "${pid_file}"
            fi
        else
            rm -f "${pid_file}"
        fi
    fi
    return 0
}

graceful_stop_pid() {
    local pid_file="$1" desc="$2"
    if [[ ! -f "${pid_file}" ]]; then
        return 0
    fi
    local pid
    pid="$(cat "${pid_file}" 2>/dev/null || true)"
    if [[ -z "${pid}" || ! "${pid}" =~ ^[0-9]+$ ]]; then
        rm -f "${pid_file}"
        return 0
    fi
    if ! ps -p "${pid}" >/dev/null 2>&1; then
        rm -f "${pid_file}"
        return 0
    fi
    warn "${desc} 正在重启 (pid=${pid})..."
    kill "${pid}" >/dev/null 2>&1 || true
    for _ in $(seq 1 15); do
        if ! ps -p "${pid}" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    if ps -p "${pid}" >/dev/null 2>&1; then
        warn "${desc} 未能优雅退出，发送 SIGKILL。"
        kill -9 "${pid}" >/dev/null 2>&1 || true
    fi
    rm -f "${pid_file}"
    return 0
}

is_port_in_use() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq ":${port}( |$)"; then
            return 0
        fi
        return 1
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1 && return 0
        return 1
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq ":${port}( |$)" && return 0
        return 1
    fi
    return 1
}

check_port_free() {
    local port="$1" desc="$2"
    local waited=0
    local force_attempted=0
    while is_port_in_use "${port}"; do
        if [[ "${waited}" -ge "${PORT_WAIT_SECONDS}" ]]; then
            if [[ "${FORCE_RESTART_SERVICES}" == "1" && "${force_attempted}" -eq 0 ]]; then
                kill_port_processes "${port}" "${desc}"
                force_attempted=1
                waited=0
                continue
            fi
            warn "${desc} 端口 ${port} 在 ${PORT_WAIT_SECONDS}s 内仍被占用，请手动释放端口或设置 ${desc} 端口环境变量后重试。"
            return 1
        fi
        sleep 1
        waited=$((waited+1))
    done
    return 0
}

kill_port_processes() {
    local port="$1" desc="$2"
    local killed=0
    if command -v lsof >/dev/null 2>&1; then
        mapfile -t pids < <(lsof -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sort -u)
        if [[ "${#pids[@]}" -gt 0 ]]; then
            warn "${desc} 端口 ${port} 被进程 (${pids[*]}) 占用，尝试终止。"
            kill "${pids[@]}" >/dev/null 2>&1 || true
            killed=1
        fi
    elif command -v fuser >/dev/null 2>&1; then
        warn "${desc} 端口 ${port} 被占用，使用 fuser 尝试终止。"
        fuser -k -n tcp "${port}" >/dev/null 2>&1 || true
        killed=1
    fi
    if [[ "${killed}" -eq 1 ]]; then
        sleep 1
    else
        warn "${desc} 端口 ${port} 被占用，但无法自动识别进程，请手动处理。"
    fi
}

ensure_secret_value() {
    local var_name="$1" file_path="$2" hex_len="$3" description="$4"
    local existing="${!var_name:-}"
    if [[ -n "${existing}" ]]; then
        printf "%s" "${existing}" > "${file_path}"
        echo "${existing}"
        return
    fi
    if [[ -f "${file_path}" ]]; then
        cat "${file_path}"
        return
    fi
    local generated=""
    if command -v openssl >/dev/null 2>&1; then
        generated="$(openssl rand -hex "${hex_len}")"
    else
        generated="$(python3 - <<PY
import secrets
print(secrets.token_hex(${hex_len}))
PY
)"
    fi
    printf "%s" "${generated}" > "${file_path}"
    warn "${description} 未显式提供，已自动生成：${generated}"
    echo "${generated}"
}

maybe_sudo() {
    if command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}
export -f maybe_sudo

require_cmd() {
    local bin="$1" hint="$2"
    if ! command -v "${bin}" >/dev/null 2>&1; then
        fatal "缺少命令：${bin}。安装提示：${hint}"
    fi
}

bootstrap_environment() {
    section "自动安装系统依赖（无环境可直接运行）"
    if ! command -v apt-get >/dev/null 2>&1; then
        warn "未检测到 apt-get，跳过系统依赖自动安装。请手动安装 Python3/PostgreSQL/Redis/Node 20/Poetry。"
        return
    fi
    local missing_pkgs=()
    command -v python3 >/dev/null 2>&1 || missing_pkgs+=("python3" "python3-venv" "python3-dev" "python3-pip")
    command -v psql >/dev/null 2>&1 || missing_pkgs+=("postgresql" "postgresql-contrib" "libpq-dev")
    command -v redis-cli >/dev/null 2>&1 || missing_pkgs+=("redis-server")
    command -v curl >/dev/null 2>&1 || missing_pkgs+=("curl")
    command -v git >/dev/null 2>&1 || missing_pkgs+=("git")
    command -v openssl >/dev/null 2>&1 || missing_pkgs+=("openssl")
    command -v rustc >/dev/null 2>&1 || missing_pkgs+=("rustc" "cargo")
    for pkg in libffi-dev libssl-dev libjpeg-dev zlib1g-dev pkg-config libxml2-dev libxslt1-dev jq ca-certificates build-essential; do
        dpkg -s "${pkg}" >/dev/null 2>&1 || missing_pkgs+=("${pkg}")
    done
    if [[ "${#missing_pkgs[@]}" -gt 0 ]]; then
        info "缺少依赖：${missing_pkgs[*]}，开始安装。"
        local pkg_list="${missing_pkgs[*]}"
        with_timeout "${TIMEOUT_APT}" "apt-get update" bash -c "maybe_sudo apt-get update"
        with_timeout "${TIMEOUT_APT}" "apt-get install" bash -c "maybe_sudo apt-get install -y ${pkg_list}"
    else
        info "系统依赖已满足，跳过 apt 安装。"
    fi
    if command -v systemctl >/dev/null 2>&1; then
        with_timeout_allow_fail "${TIMEOUT_SERVICE}" "启动 postgresql" bash -c "maybe_sudo systemctl enable --now postgresql"
        with_timeout_allow_fail "${TIMEOUT_SERVICE}" "启动 redis-server" bash -c "maybe_sudo systemctl enable --now redis-server"
    fi
}

install_poetry_if_missing() {
    section "安装/检查 Poetry"
    if command -v poetry >/dev/null 2>&1; then
        info "Poetry 已安装：$(poetry --version)"
        return
    fi
    with_timeout "${TIMEOUT_APT}" "安装 Poetry" bash -c "curl -sSL https://install.python-poetry.org | python3 -"
    export PATH="${HOME}/.local/bin:${PATH}"
    info "Poetry 安装完成。"
}

install_node_if_needed() {
    section "安装/检查 Node.js (>=20)"
    local node_major=""
    if command -v node >/dev/null 2>&1; then
        node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
        if [[ "${node_major}" -ge 20 ]]; then
            info "Node.js 版本满足要求：$(node -v)"
            return
        fi
        warn "检测到 Node.js $(node -v)，将升级到 20。"
    else
        warn "未检测到 Node.js，开始安装 nvm + Node 20。"
    fi
    if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
        with_timeout "${TIMEOUT_NODE_INSTALL}" "安装 nvm" bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    fi
    # shellcheck disable=SC1090
    . "${NVM_DIR}/nvm.sh"
    with_timeout "${TIMEOUT_NODE_INSTALL}" "安装 Node.js 20" bash -c "source '${NVM_DIR}/nvm.sh' && nvm install 20"
    nvm alias default 20
    nvm use 20
    hash -r
    info "Node.js 已准备好：$(node -v)"
}

check_prereqs() {
    section "环境预检"
    require_cmd timeout "sudo apt install -y coreutils"
    require_cmd python3 "sudo apt install -y python3 python3-venv 或使用 pyenv/conda 安装。"
    require_cmd poetry "curl -sSL https://install.python-poetry.org | python3 -"
    require_cmd node "安装 Node.js 20+，可用 nvm install 20 && nvm use 20。"
    require_cmd npm "同 Node.js 安装。"
    require_cmd pg_isready "sudo apt install -y postgresql-client。"
    require_cmd redis-cli "sudo apt install -y redis-tools。"
    require_cmd curl "sudo apt install -y curl。"
    if command -v cloudflared >/dev/null 2>&1; then
        info "cloudflared 已检测到：$(cloudflared --version | head -n1)"
    else
        warn "未检测到 cloudflared，Cloudflare 隧道无法启动，请安装后重试。"
    fi
    if command -v cf >/dev/null 2>&1; then
        info "cf CLI 已检测到：$(cf --version 2>/dev/null | head -n1)"
    else
        warn "未检测到 cf 命令（Cloudflare Zero Trust CLI），如需远程管理隧道请安装。"
    fi
    local node_ver
    node_ver="$(node -v | sed 's/v//')"
    if [[ "${node_ver%%.*}" -lt 20 ]]; then
        fatal "Node.js 需 >= 20，当前 ${node_ver}，请升级。"
    fi
}

ensure_postgres() {
    section "PostgreSQL 检查"
    if pg_isready -h 127.0.0.1 -p 5432; then
        info "PostgreSQL 可用。"
    else
        warn "PostgreSQL 未就绪，尝试启动 systemd 服务。"
        if command -v systemctl >/dev/null 2>&1; then
            with_timeout_allow_fail "${TIMEOUT_SERVICE}" "启动 postgresql" bash -c "maybe_sudo systemctl start postgresql"
            pg_isready -h 127.0.0.1 -p 5432 || fatal "PostgreSQL 仍不可用，请检查密码/pg_hba.conf。"
        else
            fatal "无法自动启动 PostgreSQL，请手动启动后重试。"
        fi
    fi
}

ensure_redis() {
    section "Redis 检查"
    if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
        info "Redis 可用。"
    else
        warn "Redis 未就绪，尝试启动 systemd 服务。"
        if command -v systemctl >/dev/null 2>&1; then
            with_timeout_allow_fail "${TIMEOUT_SERVICE}" "启动 redis-server" bash -c "maybe_sudo systemctl start redis-server"
            redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1 || fatal "Redis 仍不可用，请检查配置/密码。"
        else
            fatal "无法自动启动 Redis，请手动启动后重试。"
        fi
    fi
}

prepare_directories() {
    section "准备必要目录"
    local media_dir="${DATA_DIR}"
    local media_store_dir="${DATA_DIR}/media_store"
    local log_dir="${DATA_DIR}/logs"
    local signing_dir="${SIGNING_KEY_PATH:-${SIGNING_KEY_PATH_DEFAULT}}"
    mkdir -p "${media_dir}" "${media_store_dir}" "${log_dir}" "$(dirname "${signing_dir}")"
    info "本地数据目录：${DATA_DIR}（media_store / logs / pid）"
}

init_secrets() {
    section "初始化部署变量"
    SERVER_NAME_VALUE="${SERVER_NAME:-${SERVER_NAME_DEFAULT}}"
    PUBLIC_BASEURL_VALUE="${PUBLIC_BASEURL:-${PUBLIC_BASEURL_DEFAULT}}"
    DB_PASSWORD="$(ensure_secret_value "DB_PASSWORD" "${SECRETS_DIR}/db_password" 16 "PostgreSQL 密码")"
    REGISTRATION_SECRET="$(ensure_secret_value "REGISTRATION_SECRET" "${SECRETS_DIR}/registration_secret" 32 "注册共享密钥")"
    MACAROON_SECRET_KEY="$(ensure_secret_value "MACAROON_SECRET_KEY" "${SECRETS_DIR}/macaroon_secret_key" 32 "macaroon_secret_key")"
    FORM_SECRET="$(ensure_secret_value "FORM_SECRET" "${SECRETS_DIR}/form_secret" 32 "form_secret")"
    JWT_SECRET="$(ensure_secret_value "JWT_SECRET" "${SECRETS_DIR}/jwt_secret" 32 "Dashboard JWT 密钥")"
    JWT_REFRESH_SECRET="$(ensure_secret_value "JWT_REFRESH_SECRET" "${SECRETS_DIR}/jwt_refresh_secret" 32 "Dashboard refresh 密钥")"
    BOT_API_SECRET="$(ensure_secret_value "BOT_API_SECRET" "${SECRETS_DIR}/bot_api_secret" 32 "Bot API secret")"
    SIGNING_KEY_PATH="${SIGNING_KEY_PATH:-${SIGNING_KEY_PATH_DEFAULT}}"
    info "server_name=${SERVER_NAME_VALUE}"
    info "public_baseurl=${PUBLIC_BASEURL_VALUE}"
    info "数据库：${DB_NAME} / 用户：${DB_USER}"
    warn "生产环境请用环境变量 DB_PASSWORD/REGISTRATION_SECRET/SERVER_NAME 覆盖默认值。"
}

init_postgres_db() {
    section "初始化 PostgreSQL 数据库与用户"
    if ! command -v psql >/dev/null 2>&1; then
        warn "未找到 psql，跳过数据库初始化。"
        return
    fi
    with_timeout "${TIMEOUT_SERVICE}" "创建数据库/用户" bash -c "maybe_sudo -u postgres psql" <<EOF
DO
\$do\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
    ELSE
        ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}') THEN
        CREATE DATABASE ${DB_NAME}
            WITH ENCODING='UTF8'
            LC_COLLATE='C'
            LC_CTYPE='C'
            TEMPLATE=template0
            OWNER=${DB_USER};
    END IF;
END
\$do\$;
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF
    info "PostgreSQL 用户/数据库已准备：${DB_USER}/${DB_NAME}"
}

detect_lan_ip() {
    local candidate=""
    if command -v hostname >/dev/null 2>&1; then
        candidate="$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i !~ /^127\\./){print $i; exit}}')"
    fi
    if [[ -z "${candidate}" ]] && command -v ip >/dev/null 2>&1; then
        candidate="$(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,\"/\"); if(a[1]!~/^127\\./){print a[1]; exit}}')"
    fi
    if [[ -n "${candidate}" ]]; then
        LAN_IP="${candidate}"
        info "检测到内网 IP：${LAN_IP}"
    else
        LAN_IP="127.0.0.1"
        warn "未能自动获取内网 IP，使用回环地址 ${LAN_IP}"
    fi
}

detect_server_name_from_db() {
    section "检测现有数据库中的 server_name"
    local existing_domain=""
    if ! command -v psql >/dev/null 2>&1; then
        warn "未检测到 psql，跳过 server_name 自动探测。"
        return
    fi
    existing_domain="$(PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT split_part(name, ':', 2) FROM users LIMIT 1" 2>/dev/null | head -n1 | tr -d '[:space:]')"
    if [[ -n "${existing_domain}" && "${existing_domain}" != "${SERVER_NAME_VALUE}" ]]; then
        warn "数据库中已存在用户域 ${existing_domain}，将 server_name 从 ${SERVER_NAME_VALUE} 调整为 ${existing_domain} 以避免启动失败。"
        SERVER_NAME_VALUE="${existing_domain}"
        if [[ -z "${PUBLIC_BASEURL:-}" ]]; then
            if [[ "${SERVER_NAME_VALUE}" == "chat.internal" ]]; then
                PUBLIC_BASEURL_VALUE="${PUBLIC_BASEURL_DEFAULT}"
            else
                PUBLIC_BASEURL_VALUE="https://${SERVER_NAME_VALUE}"
            fi
            info "自动调整 public_baseurl=${PUBLIC_BASEURL_VALUE}"
        fi
    else
        info "未检测到需调整的 server_name，继续使用 ${SERVER_NAME_VALUE}"
    fi
}

apply_dashboard_schema() {
    section "导入 Dashboard Schema（自动执行 dashboard/schema/dashboard_schema.sql）"
    if ! command -v psql >/dev/null 2>&1; then
        warn "未找到 psql，跳过 schema 导入，请手动执行 dashboard/schema/dashboard_schema.sql"
        return
    fi
    # 如已有 dashboard 表，则跳过导入以避免重复 owner 报错
    local has_tables
    has_tables="$(PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT count(1) FROM information_schema.tables WHERE table_schema='dashboard'" 2>/dev/null | tr -d '[:space:]')"
    if [[ "${has_tables}" =~ ^[0-9]+$ && "${has_tables}" -gt 0 ]]; then
        info "检测到 dashboard schema 已存在 ${has_tables} 张表，跳过重复导入。"
        return
    fi
    local schema_file="${BASE_DIR}/dashboard/schema/dashboard_schema.sql"
    if [[ ! -f "${schema_file}" ]]; then
        warn "未找到 ${schema_file}，跳过 schema 导入。"
        return
    fi
    PGPASSWORD="${DB_PASSWORD}" with_timeout_allow_fail "${TIMEOUT_SERVICE}" "导入 Dashboard Schema" bash -c "psql -h 127.0.0.1 -U '${DB_USER}' -d '${DB_NAME}' -f '${schema_file}'" || warn "Schema 导入失败，请手动运行：psql -h 127.0.0.1 -U ${DB_USER} -d ${DB_NAME} -f ${schema_file}"
}
fix_dashboard_owner() {
    if ! command -v psql >/dev/null 2>&1; then
        return
    fi
    # 仅在已提供 postgres 密码时尝试，否则跳过以避免交互
    local pg_super_pwd="${POSTGRES_PASSWORD:-}"
    if [[ -z "${pg_super_pwd}" && -f "${SECRETS_DIR}/postgres_password" ]]; then
        pg_super_pwd="$(cat "${SECRETS_DIR}/postgres_password" 2>/dev/null || true)"
    fi
    if [[ -z "${pg_super_pwd}" ]]; then
        warn "未提供 POSTGRES_PASSWORD，跳过 owner 修复（若需消除 must be owner，请以 postgres 手动 ALTER OWNER）。"
        return
    fi
    with_timeout_allow_fail "${TIMEOUT_SERVICE}" "调整 dashboard schema owner" bash -c "
export PGPASSWORD='${pg_super_pwd}'
set -e
psql -h 127.0.0.1 -U postgres -d '${DB_NAME}' -v ON_ERROR_STOP=1 -c \"ALTER SCHEMA dashboard OWNER TO ${DB_USER};\" || true
tables=\$(psql -h 127.0.0.1 -U postgres -d '${DB_NAME}' -Atc \"SELECT tablename FROM pg_tables WHERE schemaname='dashboard';\" || true)
for t in \$tables; do
  psql -h 127.0.0.1 -U postgres -d '${DB_NAME}' -v ON_ERROR_STOP=1 -c \"ALTER TABLE dashboard.\\\"\$t\\\" OWNER TO ${DB_USER};\" || true
done
" || warn "dashboard schema owner 调整失败，可手动执行：ALTER SCHEMA/ALTER TABLE OWNER TO ${DB_USER}"
}

generate_log_config() {
    cat > "${LOG_CONFIG_PATH}" <<EOF
version: 1
formatters:
  precise:
    format: '%(asctime)s [%(levelname)s] %(name)s - %(message)s'
handlers:
  file:
    class: logging.handlers.TimedRotatingFileHandler
    formatter: precise
    filename: ${DATA_DIR}/logs/homeserver.log
    when: midnight
    backupCount: 3
    encoding: utf8
  console:
    class: logging.StreamHandler
    formatter: precise
root:
  level: INFO
  handlers: [file, console]
loggers:
  synapse:
    level: INFO
    handlers: [file, console]
    propagate: false
EOF
    info "已生成日志配置：${LOG_CONFIG_PATH}"
}

prepare_configs() {
    section "生成本地配置（使用内部 Postgres/Redis，完全内网监听）"
    mkdir -p "${DATA_DIR}" "${DATA_DIR}/media_store" "${DATA_DIR}/logs"
    generate_log_config
    local bind_addresses="['127.0.0.1']"
    if [[ "${BIND_ALL_INTERFACES}" == "1" ]]; then
        bind_addresses="['0.0.0.0']"
        warn "BIND_ALL_INTERFACES=1，Synapse 将监听 0.0.0.0，请确保仅在受信网络或已加防火墙的环境使用。"
    elif [[ -n "${LAN_IP}" && "${LAN_IP}" != "127.0.0.1" ]]; then
        bind_addresses="['127.0.0.1','${LAN_IP}']"
        info "已将 Synapse 绑定到 127.0.0.1 与 ${LAN_IP}，供局域网访问。"
    fi
    cat > "${CONFIG_PATH}" <<EOF
server_name: "${SERVER_NAME_VALUE}"
public_baseurl: "${PUBLIC_BASEURL_VALUE}"
pid_file: "${SYNAPSE_PID_FILE}"
listeners:
  - port: 8008
    tls: false
    bind_addresses: ${bind_addresses}
    type: http
    resources:
      - names: [client, federation]
database:
  name: psycopg2
  args:
    user: "${DB_USER}"
    password: "${DB_PASSWORD}"
    database: "${DB_NAME}"
    host: "127.0.0.1"
    port: 5432
log_config: "${LOG_CONFIG_PATH}"
media_store_path: "${DATA_DIR}/media_store"
registration_shared_secret: "${REGISTRATION_SECRET}"
macaroon_secret_key: "${MACAROON_SECRET_KEY}"
form_secret: "${FORM_SECRET}"
signing_key_path: "${SIGNING_KEY_PATH}"
report_stats: false
suppress_key_server_warning: true
trusted_key_servers:
  - server_name: "matrix.org"
trusted_third_party_id_servers: []
EOF
    info "已生成 Synapse 配置：${CONFIG_PATH}"
}
prepare_cloudflare_config() {
    if [[ -f "${CF_CONFIG}" ]]; then
        info "使用 Cloudflare 隧道配置：${CF_CONFIG}"
        return
    fi
    if [[ -f "${CF_CONFIG_FALLBACK}" ]]; then
        CF_CONFIG="${CF_CONFIG_FALLBACK}"
        warn "Cloudflare 配置缺失，使用仓库内的 cloudflared-config.yaml（隧道 ID: ${CF_TUNNEL_ID}）。"
    else
        warn "未找到 Cloudflare 隧道配置，跳过自动启动。"
    fi
}

render_dashboard_env() {
    section "生成 Dashboard 后端环境文件"
    mkdir -p "${BACKEND_DIR}"
    local lan_host="${LAN_IP:-127.0.0.1}"
    local public_base="${PUBLIC_BASEURL_VALUE%/}"
    local internal_synapse="${SYNAPSE_INTERNAL_BASE_URL:-http://${lan_host}:8008}"
    if [[ -z "${internal_synapse}" ]]; then
        internal_synapse="http://${lan_host}:8008"
    fi
    local synapse_base="${internal_synapse%/}"
    local synapse_admin_base="${synapse_base}/_synapse/admin/v2"
    local cors_local_http="http://127.0.0.1:${FRONTEND_PORT}"
    local cors_lan_http="http://${LAN_IP}:${FRONTEND_PORT}"
    local cors_origins="${cors_local_http},${cors_lan_http}"
    if [[ -n "${public_base}" ]]; then
        cors_origins="${cors_origins},${public_base}"
    fi
    cat > "${BACKEND_ENV_PATH}" <<EOF
NODE_ENV=production
PORT=${BACKEND_PORT}
DASHBOARD_HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGINS=${cors_origins}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
BOT_API_SECRET=${BOT_API_SECRET}
BOT_SERVICE_BASE_URL=http://127.0.0.1:${BOT_PORT}
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=604800
DASHBOARD_CACHE_TTL_SECONDS=300
ENABLE_MINIO_HEALTH=${ENABLE_MINIO_HEALTH}
MINIO_HEALTH_ENDPOINT=${MINIO_HEALTH_ENDPOINT}
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_USER_EVENTS_CHANNEL=dashboard.user.invalidate
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
SYNAPSE_BASE_URL=${synapse_base}
SYNAPSE_ADMIN_BASE_URL=${synapse_admin_base}
SYNAPSE_SERVER_NAME=${SERVER_NAME_VALUE}
EOF
    info "已生成 ${BACKEND_ENV_PATH}"
}

render_frontend_env() {
    section "生成 Dashboard 前端环境文件"
    mkdir -p "${FRONTEND_DIR}"
    local lan_host="${LAN_IP:-127.0.0.1}"
    local default_backend_base="http://${lan_host}:${BACKEND_PORT}"
    local resolved_base="${FRONTEND_API_BASE_URL:-${default_backend_base}}"
    [[ -z "${resolved_base}" ]] && resolved_base="${default_backend_base}"
    local api_base="${resolved_base%/}"
    local api_url="${api_base}/api/v1"
    cat > "${FRONTEND_ENV_PATH}" <<EOF
VITE_API_URL=${api_url}
VITE_API_BASE_URL=${api_url}
EOF
    info "已生成 ${FRONTEND_ENV_PATH}"
}

render_bot_env() {
    section "生成 Bot 环境文件"
    mkdir -p "${BOT_DIR}/data"
    local default_bot_user="@appeal_bot:${SERVER_NAME_VALUE}"
    local lan_host="${LAN_IP:-127.0.0.1}"
    local synapse_base_default="http://${lan_host}:8008"
    local synapse_base="${SYNAPSE_INTERNAL_BASE_URL:-${synapse_base_default}}"
    [[ -z "${synapse_base}" ]] && synapse_base="${synapse_base_default}"
    synapse_base="${synapse_base%/}"
    local bot_dashboard_default="http://${lan_host}:${BACKEND_PORT}"
    local api_base="${BOT_API_BASE_URL:-${bot_dashboard_default}}"
    [[ -z "${api_base}" ]] && api_base="${bot_dashboard_default}"
    api_base="${api_base%/}"
    read_bot_env_var() {
        local key="$1" default_value="$2"
        if [[ -f "${BOT_ENV_PATH}" ]]; then
            local line
            line="$(grep -E "^${key}=" "${BOT_ENV_PATH}" | tail -n1 || true)"
            if [[ -n "${line}" ]]; then
                echo "${line#*=}"
                return
            fi
        fi
        echo "${default_value}"
    }
    local bot_username bot_password bot_access_token bot_display_name bot_storage_path bot_admin_room_id cors_origins
    bot_username="${MATRIX_BOT_USERNAME:-$(read_bot_env_var "MATRIX_BOT_USERNAME" "${default_bot_user}")}"
    bot_password="${MATRIX_BOT_PASSWORD:-$(read_bot_env_var "MATRIX_BOT_PASSWORD" "change-me")}"
    bot_access_token="${MATRIX_BOT_ACCESS_TOKEN:-$(read_bot_env_var "MATRIX_BOT_ACCESS_TOKEN" "")}"
    bot_display_name="$(read_bot_env_var "MATRIX_BOT_DISPLAY_NAME" "申诉助理")"
    bot_storage_path="$(read_bot_env_var "MATRIX_BOT_STORAGE_PATH" "${BOT_DIR}/data/matrix-bot.json")"
    bot_admin_room_id="${BOT_ADMIN_ROOM_ID:-$(read_bot_env_var "BOT_ADMIN_ROOM_ID" "!adminRoomId:${SERVER_NAME_VALUE}")}"
    cors_origins="$(read_bot_env_var "CORS_ORIGINS" "http://127.0.0.1:${BACKEND_PORT},http://${LAN_IP}:${BACKEND_PORT}")"
    local shadow_room_prefix shadow_room_name_prefix shadow_room_topic_template
    shadow_room_prefix="$(read_bot_env_var "SHADOW_ROOM_PREFIX" "shadow_")"
    shadow_room_name_prefix="$(read_bot_env_var "SHADOW_ROOM_NAME_PREFIX" "频道 | ")"
    shadow_room_topic_template="$(read_bot_env_var "SHADOW_ROOM_TOPIC_TEMPLATE" "频道 %key% 的系统广播")"
    cat > "${BOT_ENV_PATH}" <<EOF
NODE_ENV=production
PORT=${BOT_PORT}
HOST=0.0.0.0

# Matrix Bot 配置（请改为真实账号/访问令牌）
MATRIX_BOT_USERNAME=${bot_username}
MATRIX_BOT_PASSWORD=${bot_password}
# 可选：提供访问令牌后可留空密码
MATRIX_BOT_ACCESS_TOKEN=${bot_access_token}
MATRIX_BOT_HOMESERVER=${synapse_base}
MATRIX_BOT_DISPLAY_NAME=${bot_display_name}
MATRIX_BOT_STORAGE_PATH=${bot_storage_path}

# Dashboard API & 安全
DASHBOARD_API_BASE_URL=${api_base}
BOT_API_SECRET=${BOT_API_SECRET}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGINS=${cors_origins}
SHADOW_ROOM_PREFIX=${shadow_room_prefix}
SHADOW_ROOM_NAME_PREFIX=${shadow_room_name_prefix}
SHADOW_ROOM_TOPIC_TEMPLATE=${shadow_room_topic_template}

# 数据库/Redis
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
DATABASE_SSL=false
REDIS_URL=redis://127.0.0.1:6379

# 其他
BOT_ADMIN_ROOM_ID=${bot_admin_room_id}
LOG_LEVEL=info
LOG_FORMAT=json
EOF
    info "已生成 ${BOT_ENV_PATH}（保留已有的 MATRIX_BOT_* 值，启动前请确保凭证已填充）"
}

install_python_stack() {
    section "安装 Python 依赖与扩展"
    with_timeout "${TIMEOUT_POETRY_INSTALL}" "poetry install" bash -c "cd '${BASE_DIR}' && poetry install --with dev -E all"
    if [[ -f "${BASE_DIR}/build_rust.py" ]]; then
        with_timeout_allow_fail "${TIMEOUT_POETRY_INSTALL}" "构建 Rust 扩展" bash -c "cd '${BASE_DIR}' && poetry run python build_rust.py" || warn "Rust 扩展构建失败，使用纯 Python 运行。"
    fi
}

generate_signing_key() {
    section "生成 Synapse 签名密钥"
    if [[ -f "${SIGNING_KEY_PATH}" ]]; then
        info "签名密钥已存在：${SIGNING_KEY_PATH}"
        return
    fi
    mkdir -p "$(dirname "${SIGNING_KEY_PATH}")"
    if with_timeout_allow_fail "${TIMEOUT_SERVICE}" "生成签名密钥" bash -c "cd '${BASE_DIR}' && poetry run generate_signing_key --output_file '${SIGNING_KEY_PATH}'"; then
        :
    else
        warn "generate_signing_key 不可用，尝试 legacy keygen。"
        with_timeout "${TIMEOUT_SERVICE}" "生成签名密钥(legacy)" bash -c "cd '${BASE_DIR}' && poetry run python -m synapse.crypto.keygen --key-type ed25519 --output '${SIGNING_KEY_PATH}'"
    fi
    chmod 600 "${SIGNING_KEY_PATH}" || true
    info "签名密钥已生成：${SIGNING_KEY_PATH}"
}

start_synapse() {
    section "启动 Matrix Synapse"
    local synapse_running=0
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:8008/_matrix/client/versions" >/dev/null 2>&1; then
        synapse_running=1
    fi
    if [[ "${synapse_running}" -eq 1 ]]; then
        if [[ "${FORCE_RESTART_SERVICES}" == "1" ]]; then
            graceful_stop_pid "${SYNAPSE_PID_FILE}" "Synapse"
            sleep 2
        else
            info "Synapse 已在运行，无需重复启动。"
            return
        fi
    fi
    stop_stale_pid "${SYNAPSE_PID_FILE}" "Synapse" || true
    check_port_free 8008 "Synapse" || return
    with_timeout "${TIMEOUT_SYNAPSE_START}" "启动 Synapse (poetry)" bash -c "cd '${BASE_DIR}' && poetry run python -m synapse.app.homeserver --config-path '${CONFIG_PATH}' --daemonize"
    sleep 3
    if ! curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:8008/_matrix/client/versions" >/dev/null 2>&1; then
        warn "Synapse 健康检查失败，可查看 ${DATA_DIR}/logs/homeserver.log 或 ${LOG_FILE}。"
    else
        info "Synapse 已就绪：http://127.0.0.1:8008/_matrix/client/versions"
    fi
}

start_dashboard_backend() {
    section "启动 Dashboard 后端"
    if [[ ! -d "${BACKEND_DIR}" ]]; then
        warn "未找到 ${BACKEND_DIR}，跳过后端启动。"
        return
    fi
    render_dashboard_env
    local backend_running=0
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BACKEND_PORT}/health/ready" >/dev/null 2>&1 || \
       curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://${LAN_IP:-127.0.0.1}:${BACKEND_PORT}/health/ready" >/dev/null 2>&1; then
        backend_running=1
    fi
    if [[ "${backend_running}" -eq 1 ]]; then
        if [[ "${FORCE_RESTART_SERVICES}" == "1" ]]; then
            graceful_stop_pid "${RUNTIME_DIR}/dashboard_backend.pid" "Dashboard 后端"
            sleep 1
        else
            info "Dashboard 后端已在运行，无需重复启动。"
            return
        fi
    fi
    stop_stale_pid "${RUNTIME_DIR}/dashboard_backend.pid" "Dashboard 后端" || true
    check_port_free "${BACKEND_PORT}" "Dashboard 后端" || return
    with_timeout "${TIMEOUT_NPM_INSTALL}" "npm install (backend)" bash -c "cd '${BACKEND_DIR}' && npm install --no-progress"
    with_timeout_allow_fail "${TIMEOUT_SERVICE}" "清理 dist (backend)" bash -c "cd '${BACKEND_DIR}' && rm -rf dist"
    with_timeout "${TIMEOUT_NPM_BUILD}" "npm run build (backend)" bash -c "cd '${BACKEND_DIR}' && npm run build"
    # 迁移由脚本前置的 apply_dashboard_schema 完成，避免重复警告；如需二次迁移可手动执行 npm run db:migrate
    local backend_start_cmd="PORT='${BACKEND_PORT}' DASHBOARD_HOST='0.0.0.0' npm run start:prod"
    if [[ ! -d "${BACKEND_DIR}/dist" ]]; then
        warn "未找到 dist，回退为 ts-node 直接启动（性能略低）。"
        backend_start_cmd="PORT='${BACKEND_PORT}' DASHBOARD_HOST='0.0.0.0' npm run start"
    fi
    with_timeout "${TIMEOUT_SERVICE}" "启动 Dashboard 后端" bash -c "cd '${BACKEND_DIR}' && ${backend_start_cmd} >>'${LOG_FILE}' 2>&1 & echo \$! > '${RUNTIME_DIR}/dashboard_backend.pid'"
    sleep 2
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BACKEND_PORT}/health/ready" >/dev/null 2>&1; then
        info "Dashboard 后端已就绪：http://127.0.0.1:${BACKEND_PORT}/health/ready"
    else
        warn "后端健康检查失败，请检查 ${BACKEND_DIR}/.env、数据库/Redis 连接与端口占用。"
        warn "后端最近日志片段："
        tail -n 80 "${LOG_FILE}" | sed 's/^/[backend-log] /'
    fi
}

start_dashboard_frontend() {
    section "启动 Dashboard 前端"
    if [[ ! -d "${FRONTEND_DIR}" ]]; then
        warn "未找到 ${FRONTEND_DIR}，跳过前端启动。"
        return
    fi
    render_frontend_env
    local frontend_running=0
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1 || \
       curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://${LAN_IP:-127.0.0.1}:${FRONTEND_PORT}" >/dev/null 2>&1; then
        frontend_running=1
    fi
    if [[ "${frontend_running}" -eq 1 ]]; then
        if [[ "${FORCE_RESTART_SERVICES}" == "1" ]]; then
            graceful_stop_pid "${RUNTIME_DIR}/dashboard_frontend.pid" "Dashboard 前端"
            sleep 1
        else
            info "Dashboard 前端已在运行，无需重复启动。"
            return
        fi
    fi
    stop_stale_pid "${RUNTIME_DIR}/dashboard_frontend.pid" "Dashboard 前端" || true
    check_port_free "${FRONTEND_PORT}" "Dashboard 前端" || return
    with_timeout "${TIMEOUT_NPM_INSTALL}" "npm install (frontend)" bash -c "cd '${FRONTEND_DIR}' && npm install --no-progress"
    with_timeout_allow_fail "${TIMEOUT_SERVICE}" "清理 dist (frontend)" bash -c "cd '${FRONTEND_DIR}' && rm -rf dist"
    with_timeout "${TIMEOUT_NPM_BUILD}" "npm run build (frontend)" bash -c "cd '${FRONTEND_DIR}' && npm run build"
    with_timeout "${TIMEOUT_SERVICE}" "启动 Dashboard 前端" bash -c "cd '${FRONTEND_DIR}' && npm run preview -- --host 0.0.0.0 --port '${FRONTEND_PORT}' >>'${LOG_FILE}' 2>&1 & echo \$! > '${RUNTIME_DIR}/dashboard_frontend.pid'"
    sleep 2
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
        info "Dashboard 前端预览就绪：http://127.0.0.1:${FRONTEND_PORT}"
    else
        warn "前端未通过健康检查，检查端口占用或 VITE_API_URL 配置。"
        warn "前端最近日志片段："
        tail -n 80 "${LOG_FILE}" | sed 's/^/[frontend-log] /'
    fi
}

start_dashboard_bot() {
    section "启动 Matrix Dashboard Bot"
    if [[ ! -d "${BOT_DIR}" ]]; then
        warn "未找到 ${BOT_DIR}，跳过 Bot 启动。"
        return
    fi
    render_bot_env
    local bot_pwd bot_token bot_admin_room
    bot_pwd="$(grep -E "^MATRIX_BOT_PASSWORD=" "${BOT_ENV_PATH}" | tail -n1 | cut -d= -f2- || true)"
    bot_token="$(grep -E "^MATRIX_BOT_ACCESS_TOKEN=" "${BOT_ENV_PATH}" | tail -n1 | cut -d= -f2- || true)"
    bot_admin_room="$(grep -E "^BOT_ADMIN_ROOM_ID=" "${BOT_ENV_PATH}" | tail -n1 | cut -d= -f2- || true)"
    if { [[ -z "${bot_pwd}" || "${bot_pwd}" == "change-me" ]] && [[ -z "${bot_token}" ]]; } || [[ "${bot_admin_room}" == "!adminRoomId:${SERVER_NAME_VALUE}" || -z "${bot_admin_room}" ]]; then
        warn "Bot 凭证仍为占位符或缺失，已跳过启动。请在 ${BOT_ENV_PATH} 中填写 MATRIX_BOT_PASSWORD 或 MATRIX_BOT_ACCESS_TOKEN，以及真实 BOT_ADMIN_ROOM_ID 后重试。"
        return
    fi
    local bot_running=0
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BOT_PORT}/health" >/dev/null 2>&1; then
        bot_running=1
    fi
    if [[ "${bot_running}" -eq 1 ]]; then
        if [[ "${FORCE_RESTART_SERVICES}" == "1" ]]; then
            graceful_stop_pid "${RUNTIME_DIR}/dashboard_bot.pid" "Dashboard Bot"
            sleep 1
        else
            info "Dashboard Bot 已在运行，无需重复启动。"
            return
        fi
    fi
    stop_stale_pid "${RUNTIME_DIR}/dashboard_bot.pid" "Dashboard Bot" || true
    check_port_free "${BOT_PORT}" "Dashboard Bot" || {
        warn "Bot 端口 ${BOT_PORT} 被占用，跳过启动（不阻断后续总结）。"
        return
    }
    with_timeout "${TIMEOUT_NPM_INSTALL}" "npm install (bot)" bash -c "cd '${BOT_DIR}' && npm install --no-progress"
    with_timeout "${TIMEOUT_NPM_BUILD}" "npm run build (bot)" bash -c "cd '${BOT_DIR}' && npm run build"
    with_timeout "${TIMEOUT_SERVICE}" "启动 Bot" bash -c "cd '${BOT_DIR}' && PORT='${BOT_PORT}' HOST='0.0.0.0' npm run start >>'${LOG_FILE}' 2>&1 & echo \$! > '${RUNTIME_DIR}/dashboard_bot.pid'"
    sleep 2
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BOT_PORT}/health" >/dev/null 2>&1; then
        info "Bot 健康检查通过：http://127.0.0.1:${BOT_PORT}/health"
    else
        warn "Bot 健康检查未通过，请确认 Matrix 账号/密码或 access token 正确。"
        warn "如需跳过 Bot，可忽略此提示；若需启动，请填写 ${BOT_ENV_PATH} 中的 MATRIX_BOT_PASSWORD 或 MATRIX_BOT_ACCESS_TOKEN 并重跑脚本。"
    fi
}

start_cloudflare_tunnel() {
    section "启动 Cloudflare 隧道"
    if ! command -v cloudflared >/dev/null 2>&1; then
        warn "未检测到 cloudflared，可参考 configure_cloudflare_tunnel.md 手动安装。"
        return
    fi
    if [[ ! -f "${CF_CONFIG}" ]]; then
        warn "未找到 Cloudflare 配置，跳过隧道启动。"
        return
    fi
    if cloudflared tunnel info "${CF_TUNNEL_ID}" >/dev/null 2>&1; then
        info "Cloudflare 隧道已在运行，无需重复启动。"
        return
    fi
    if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^cloudflared.service"; then
        with_timeout_allow_fail "${TIMEOUT_SERVICE}" "systemctl restart cloudflared" bash -c "maybe_sudo systemctl restart cloudflared"
    else
        with_timeout_allow_fail "${TIMEOUT_SERVICE}" "启动 cloudflared 隧道" bash -c "cloudflared tunnel --config '${CF_CONFIG}' run '${CF_TUNNEL_ID}' >>'${LOG_FILE}' 2>&1 & echo \$! > '${RUNTIME_DIR}/cloudflared.pid'"
    fi
    sleep 3
    with_timeout_allow_fail "${TIMEOUT_HEALTH}" "检查 cloudflared 状态" cloudflared tunnel info "${CF_TUNNEL_ID}" || warn "隧道信息查询失败，请检查 Cloudflare 登录与配置。"
}

health_report() {
    section "健康检查汇总"
    curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:8008/_matrix/client/versions" >/dev/null 2>&1 && info "Synapse API ✓" || warn "Synapse API ✗"
    curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BACKEND_PORT}/health/ready" >/dev/null 2>&1 && info "Dashboard 后端 ✓" || warn "Dashboard 后端 ✗"
    curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1 && info "Dashboard 前端 ✓" || warn "Dashboard 前端 ✗"
    if [[ -d "${BOT_DIR}" && -f "${BOT_ENV_PATH}" ]]; then
        curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BOT_PORT}/health" >/dev/null 2>&1 && info "Matrix Bot ✓" || warn "Matrix Bot ✗（如未配置凭证可忽略）"
    fi
    if command -v cloudflared >/dev/null 2>&1; then
        with_timeout_allow_fail "${TIMEOUT_HEALTH}" "检查 cloudflared 状态" cloudflared tunnel info "${CF_TUNNEL_ID}" >/dev/null 2>&1 && info "Cloudflare 隧道 ✓" || warn "Cloudflare 隧道 ✗"
    fi
    warn "若出现 1033/522/530，可根据 HELP.md/SAVE.md 检查 DNS、Public Hostnames、SSL=Full(strict)。"
}

next_steps() {
    section "完成与后续"
    info "访问内网: Synapse http://127.0.0.1:8008/_matrix/client/versions"
    info "访问内网: Dashboard 后端 http://127.0.0.1:${BACKEND_PORT}/health/ready"
    info "访问内网: Dashboard 前端 http://127.0.0.1:${FRONTEND_PORT}"
    info "访问内网 (局域网): Synapse http://${LAN_IP:-127.0.0.1}:8008/_matrix/client/versions"
    info "访问内网 (局域网): Dashboard 后端 http://${LAN_IP:-127.0.0.1}:${BACKEND_PORT}/health/ready"
    info "访问内网 (局域网): Dashboard 前端 http://${LAN_IP:-127.0.0.1}:${FRONTEND_PORT}"
    info "配置文件：${CONFIG_PATH}"
    info "日志配置：${LOG_CONFIG_PATH}"
    info "密钥/密码文件：${SECRETS_DIR}（db_password / registration_secret / jwt_secret / bot_api_secret），签名密钥：${SIGNING_KEY_PATH}"
    info "日志文件：${LOG_FILE}"
    warn "测试步骤（可逐条执行）:"
    warn "  1) curl -fsS http://127.0.0.1:8008/_matrix/client/versions"
    warn "  2) curl -fsS http://127.0.0.1:${BACKEND_PORT}/health/ready"
    warn "  3) curl -fsS http://127.0.0.1:${BACKEND_PORT}/monitor/status | jq '.summary' (需 jq)"
    warn "  4) 浏览器访问 http://127.0.0.1:${FRONTEND_PORT} 登录 Dashboard（首次请在后端 API 创建管理员）"
    warn "  5) 如已配置 Matrix Bot 凭证：curl -fsS http://127.0.0.1:${BOT_PORT}/health"
    warn "如需停止后台进程，可执行："
    warn "  kill \$(cat ${RUNTIME_DIR}/synapse.pid ${RUNTIME_DIR}/dashboard_backend.pid ${RUNTIME_DIR}/dashboard_frontend.pid ${RUNTIME_DIR}/dashboard_bot.pid ${RUNTIME_DIR}/cloudflared.pid 2>/dev/null) || true"
}

main() {
    section "Matrix 部署启动向导（所有输出已写入 ${LOG_FILE}）"
    bootstrap_environment
    install_poetry_if_missing
    install_node_if_needed
    check_prereqs
    detect_lan_ip
    init_secrets
    prepare_directories
    ensure_postgres
    init_postgres_db
    detect_server_name_from_db
    ensure_redis
    apply_dashboard_schema
    fix_dashboard_owner
    prepare_configs
    prepare_cloudflare_config
    render_dashboard_env
    render_frontend_env
    render_bot_env
    install_python_stack
    generate_signing_key
    start_synapse
    start_dashboard_backend
    start_dashboard_frontend
    start_dashboard_bot
    start_cloudflare_tunnel
    health_report
    next_steps
}

main "$@"
