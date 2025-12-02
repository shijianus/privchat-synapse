#!/usr/bin/env bash

# Matrix Synapse + Dashboard + Cloudflare Tunnel 一键部署/启动脚本
# 设计目标：一次跑通，步骤有超时防卡死，systemd 失败会自动回退为直接运行。

set -Eeuo pipefail

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
section() { printf '\n===== %s =====\n' "$*"; }

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${BASE_DIR}/log.txt"
RUNTIME_DIR="${BASE_DIR}/.runtime"
: "${NVM_DIR:=${HOME}/.nvm}"
SECRETS_DIR="${RUNTIME_DIR}/secrets"
mkdir -p "${RUNTIME_DIR}" "${SECRETS_DIR}"
: > "${LOG_FILE}"
exec > >(tee "${LOG_FILE}") 2>&1
export PATH="${HOME}/.local/bin:${PATH}"

CONFIG_PATH="${CONFIG_PATH:-/etc/matrix-synapse/homeserver.yaml}"
LOG_CONFIG_PATH="${LOG_CONFIG_PATH:-/etc/matrix-synapse/log_config.yaml}"
LOCAL_CONFIG="${BASE_DIR}/homeserver.yaml"
LOCAL_LOG_CONFIG="${BASE_DIR}/log_config.yaml"
FALLBACK_CONFIG="${BASE_DIR}/config/homeserver_matrix_production.yaml"
FALLBACK_LOG_CONFIG="${BASE_DIR}/config/log_config_production.yaml"
CF_CONFIG="${CF_CONFIG:-/etc/cloudflared/config.yml}"
CF_CONFIG_FALLBACK="${BASE_DIR}/cloudflared-config.yaml"
CF_TUNNEL_ID="${CF_TUNNEL_ID:-838e2463-3bad-4129-a0a2-63d9abf0f215}"
BACKEND_DIR="${BASE_DIR}/dashboard/backend"
FRONTEND_DIR="${BASE_DIR}/dashboard/frontend"
BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
SERVER_NAME_DEFAULT="${SERVER_NAME:-chat.831511.xyz}"
PUBLIC_BASEURL_DEFAULT="${PUBLIC_BASEURL:-https://${SERVER_NAME_DEFAULT}}"
DB_USER="${DB_USER:-synapse_user}"
DB_NAME="${DB_NAME:-synapse}"
SIGNING_KEY_PATH_DEFAULT="${SIGNING_KEY_PATH:-${SECRETS_DIR}/${SERVER_NAME_DEFAULT}.signing.key}"
LAN_IP="127.0.0.1"
USING_LOCAL_CONFIG="false"
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
    local media_dir="/var/lib/matrix-synapse"
    local media_store_dir="/var/lib/matrix-synapse/media_store"
    local log_dir="/var/log/matrix-synapse"
    local signing_dir="${SIGNING_KEY_PATH:-${SIGNING_KEY_PATH_DEFAULT}}"
    for dir in "${media_dir}" "${media_store_dir}" "${log_dir}" "$(dirname "${signing_dir}")"; do
        if [[ ! -d "${dir}" ]]; then
            maybe_sudo mkdir -p "${dir}"
            warn "已创建目录：${dir}"
        fi
    done
}

init_secrets() {
    section "初始化部署变量"
    local legacy_dir="${RUNTIME_DIR}/secrets}"
    if [[ -d "${legacy_dir}" ]]; then
        warn "检测到旧版密钥目录 ${legacy_dir}，自动迁移至 ${SECRETS_DIR}。"
        for f in db_password registration_secret *.signing.key; do
            if compgen -G "${legacy_dir}/${f}" >/dev/null 2>&1; then
                cp -n ${legacy_dir}/${f} "${SECRETS_DIR}/" 2>/dev/null || true
            fi
        done
    fi
    SERVER_NAME_VALUE="${SERVER_NAME:-${SERVER_NAME_DEFAULT}}"
    PUBLIC_BASEURL_VALUE="${PUBLIC_BASEURL:-https://${SERVER_NAME_VALUE}}"
    DB_PASSWORD="$(ensure_secret_value "DB_PASSWORD" "${SECRETS_DIR}/db_password" 16 "PostgreSQL 密码")"
    REGISTRATION_SECRET="$(ensure_secret_value "REGISTRATION_SECRET" "${SECRETS_DIR}/registration_secret" 32 "注册共享密钥")"
    MACAROON_SECRET_KEY="$(ensure_secret_value "MACAROON_SECRET_KEY" "${SECRETS_DIR}/macaroon_secret_key" 32 "macaroon_secret_key")"
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

apply_config_overrides() {
    local cfg="$1"
    perl -pi -e "s/^server_name:.*/server_name: \"${SERVER_NAME_VALUE}\"/" "${cfg}"
    perl -pi -e "s|^public_baseurl:.*|public_baseurl: \"${PUBLIC_BASEURL_VALUE}\"|" "${cfg}"
    perl -pi -e "s|password: \"your_postgres_password_here\"|password: \"${DB_PASSWORD}\"|" "${cfg}"
    perl -pi -e "s|registration_shared_secret: \"your_registration_secret_here\"|registration_shared_secret: \"${REGISTRATION_SECRET}\"|" "${cfg}"
    perl -pi -e "s|^signing_key_path:.*|signing_key_path: \"${SIGNING_KEY_PATH}\"|" "${cfg}"
    if grep -q "^macaroon_secret_key:" "${cfg}"; then
        perl -pi -e "s|^macaroon_secret_key:.*|macaroon_secret_key: \"${MACAROON_SECRET_KEY}\"|" "${cfg}"
    else
        printf 'macaroon_secret_key: "%s"\n' "${MACAROON_SECRET_KEY}" >> "${cfg}"
    fi
    if [[ -n "${LOG_CONFIG_PATH}" ]]; then
        perl -pi -e "s|^log_config:.*|log_config: \"${LOG_CONFIG_PATH}\"|" "${cfg}"
    fi
    if grep -q "^report_stats:" "${cfg}"; then
        perl -pi -e "s/^report_stats:.*/report_stats: false/" "${cfg}"
    else
        printf '\nreport_stats: false\n' >> "${cfg}"
    fi
    if grep -q "^suppress_key_server_warning:" "${cfg}"; then
        perl -pi -e "s/^suppress_key_server_warning:.*/suppress_key_server_warning: true/" "${cfg}"
    else
        printf 'suppress_key_server_warning: true\n' >> "${cfg}"
    fi
    # psycopg2 不支持 query_timeout DSN 参数，移除避免启动报错
    perl -ni -e "print unless /query_timeout:/" "${cfg}"
    # 移除 options 拼接的 default_transaction_isolation 以兼容 PostgreSQL
    perl -ni -e "print unless /^    options:/ || /^    options:/" "${cfg}"
    # Dashboard 自定义模块在当前分支签名不匹配，默认禁用以保证启动
    perl -0777 -pi -e "s/modules:\\n(\\s+- module:.*?)(?=\\n[A-Za-z_]|\\Z)/modules: []\\n/sg" "${cfg}"
    warn "已更新配置：server_name=${SERVER_NAME_VALUE}，public_baseurl=${PUBLIC_BASEURL_VALUE}，数据库密码、注册密钥已写入。"
}

sanitize_log_config() {
    local log_cfg="$1"
    # 移除 systemd handler，避免缺少 python-systemd 导致报错
    perl -0777 -pi -e "s/^[ ]{2}systemd:\\n(?:^[ ]{4}.*\\n)+//mg" "${log_cfg}"
    perl -pi -e "s/handlers: \\[file, json_file, systemd\\]/handlers: [file, json_file]/" "${log_cfg}"
    perl -pi -e "s/handlers: \\[systemd, file, json_file\\]/handlers: [file, json_file]/" "${log_cfg}"
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

prepare_configs() {
    section "准备配置文件"
    # 优先使用模板生成本地配置，避免系统残留配置（server_name=localhost 等）导致失败。
    if [[ -f "${FALLBACK_CONFIG}" ]]; then
        cp "${FALLBACK_CONFIG}" "${LOCAL_CONFIG}"
        CONFIG_PATH="${LOCAL_CONFIG}"
        LOG_CONFIG_PATH="${LOCAL_LOG_CONFIG}"
        USING_LOCAL_CONFIG="true"
        warn "已使用模板生成本地配置：${LOCAL_CONFIG}（不使用系统残留配置）。"
    else
        if [[ -f "${CONFIG_PATH}" ]]; then
            info "未找到模板，继续使用已有配置：${CONFIG_PATH}"
            USING_LOCAL_CONFIG="false"
        else
            fatal "未找到 Synapse 配置模板，也未找到系统配置。"
        fi
    fi

    if [[ -f "${LOG_CONFIG_PATH}" ]]; then
        info "使用日志配置：${LOG_CONFIG_PATH}"
    else
        if [[ -f "${FALLBACK_LOG_CONFIG}" ]]; then
            local log_dir
            log_dir="$(dirname "${LOG_CONFIG_PATH}")"
            if [[ -w "${log_dir}" ]]; then
                mkdir -p "${log_dir}"
                cp "${FALLBACK_LOG_CONFIG}" "${LOG_CONFIG_PATH}"
            elif [[ ! -d "${log_dir}" && -w "$(dirname "${log_dir}")" ]]; then
                mkdir -p "${log_dir}"
                cp "${FALLBACK_LOG_CONFIG}" "${LOG_CONFIG_PATH}"
            else
                maybe_sudo mkdir -p "${log_dir}"
                maybe_sudo cp "${FALLBACK_LOG_CONFIG}" "${LOG_CONFIG_PATH}"
            fi
            warn "日志配置缺失，已复制 ${FALLBACK_LOG_CONFIG} -> ${LOG_CONFIG_PATH}。"
        else
            warn "未找到日志配置模板，将使用默认日志配置。"
        fi
    fi
    if [[ -f "${LOG_CONFIG_PATH}" ]]; then
        sanitize_log_config "${LOG_CONFIG_PATH}"
    fi

    if [[ "${USING_LOCAL_CONFIG}" == "true" ]]; then
        apply_config_overrides "${CONFIG_PATH}"
    else
        warn "检测到已有系统配置，未自动覆盖 server_name/密码，请人工确认。"
    fi

    if [[ -f "${CF_CONFIG}" ]]; then
        info "使用 Cloudflare 隧道配置：${CF_CONFIG}"
    else
        if [[ -f "${CF_CONFIG_FALLBACK}" ]]; then
            CF_CONFIG="${CF_CONFIG_FALLBACK}"
            warn "Cloudflare 配置缺失，使用仓库内的 cloudflared-config.yaml（隧道 ID: ${CF_TUNNEL_ID}）。"
        else
            warn "未找到 Cloudflare 隧道配置，跳过自动启动。"
        fi
    fi
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
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:8008/_matrix/client/versions" >/dev/null 2>&1; then
        info "Synapse 已在运行，无需重复启动。"
        return
    fi
    local started=false
    if [[ "${USING_LOCAL_CONFIG}" != "true" ]] && command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^matrix-synapse.service"; then
        if with_timeout_allow_fail "${TIMEOUT_SYNAPSE_START}" "systemctl restart matrix-synapse" bash -c "maybe_sudo systemctl restart matrix-synapse"; then
            started=true
        else
            warn "systemctl 启动失败，尝试直接以 poetry 启动。"
        fi
    fi
    if [[ "${started}" != true ]]; then
        with_timeout "${TIMEOUT_SYNAPSE_START}" "启动 Synapse (poetry)" bash -c "cd '${BASE_DIR}' && poetry run python -m synapse.app.homeserver --config-path '${CONFIG_PATH}' --daemonize"
    fi
    sleep 3
    if ! curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:8008/_matrix/client/versions" >/dev/null 2>&1; then
        warn "Synapse 健康检查失败，可查看 /var/log/matrix-synapse 或 ${LOG_FILE}。"
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
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BACKEND_PORT}/health/ready" >/dev/null 2>&1 || \
       curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://${LAN_IP:-127.0.0.1}:${BACKEND_PORT}/health/ready" >/dev/null 2>&1; then
        info "Dashboard 后端已在运行，无需重复启动。"
        return
    fi
    if [[ ! -f "${BACKEND_DIR}/.env" && -f "${BASE_DIR}/config/dashboard.env.template" ]]; then
        cp "${BASE_DIR}/config/dashboard.env.template" "${BACKEND_DIR}/.env"
        warn "已生成后台 .env，请确认数据库/Redis/JWT 配置后重新运行。"
    fi
    with_timeout "${TIMEOUT_NPM_INSTALL}" "npm install (backend)" bash -c "cd '${BACKEND_DIR}' && npm install --no-progress"
    with_timeout "${TIMEOUT_NPM_BUILD}" "npm run build (backend)" bash -c "cd '${BACKEND_DIR}' && npm run build"
    with_timeout "${TIMEOUT_SERVICE}" "启动 Dashboard 后端" bash -c "cd '${BACKEND_DIR}' && PORT='${BACKEND_PORT}' DASHBOARD_HOST='0.0.0.0' npm run start:prod >>'${LOG_FILE}' 2>&1 & echo \$! > '${RUNTIME_DIR}/dashboard_backend.pid'"
    sleep 2
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${BACKEND_PORT}/health/ready" >/dev/null 2>&1; then
        info "Dashboard 后端已就绪：http://127.0.0.1:${BACKEND_PORT}/health/ready"
    else
        warn "后端健康检查失败，请检查 ${BACKEND_DIR}/.env、数据库/Redis 连接与端口占用。"
    fi
}

start_dashboard_frontend() {
    section "启动 Dashboard 前端"
    if [[ ! -d "${FRONTEND_DIR}" ]]; then
        warn "未找到 ${FRONTEND_DIR}，跳过前端启动。"
        return
    fi
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1 || \
       curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://${LAN_IP:-127.0.0.1}:${FRONTEND_PORT}" >/dev/null 2>&1; then
        info "Dashboard 前端已在运行，无需重复启动。"
        return
    fi
    with_timeout "${TIMEOUT_NPM_INSTALL}" "npm install (frontend)" bash -c "cd '${FRONTEND_DIR}' && npm install --no-progress"
    with_timeout "${TIMEOUT_NPM_BUILD}" "npm run build (frontend)" bash -c "cd '${FRONTEND_DIR}' && npm run build"
    with_timeout "${TIMEOUT_SERVICE}" "启动 Dashboard 前端" bash -c "cd '${FRONTEND_DIR}' && npm run preview -- --host 0.0.0.0 --port '${FRONTEND_PORT}' >>'${LOG_FILE}' 2>&1 & echo \$! > '${RUNTIME_DIR}/dashboard_frontend.pid'"
    sleep 2
    if curl -fsS --max-time "${TIMEOUT_HEALTH}" "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
        info "Dashboard 前端预览就绪：http://127.0.0.1:${FRONTEND_PORT}"
    else
        warn "前端未通过健康检查，检查端口占用或 VITE_API_URL 配置。"
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
    info "公网（需 Cloudflare 配置）：https://${SERVER_NAME_VALUE}/_matrix/client/versions 与 https://admin.${SERVER_NAME_VALUE}/health/ready"
    info "配置文件：${CONFIG_PATH}"
    info "日志配置：${LOG_CONFIG_PATH}"
    info "密钥/密码文件：${SECRETS_DIR}（db_password / registration_secret），签名密钥：${SIGNING_KEY_PATH}"
    info "日志文件：${LOG_FILE}"
    warn "Dashboard 测试账号：Email matrix.admin@example.com / Password admin123"
    warn "如需停止后台进程，可执行："
    warn "  kill \$(cat ${RUNTIME_DIR}/synapse.pid ${RUNTIME_DIR}/dashboard_backend.pid ${RUNTIME_DIR}/dashboard_frontend.pid ${RUNTIME_DIR}/cloudflared.pid 2>/dev/null) || true"
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
    ensure_redis
    prepare_configs
    install_python_stack
    generate_signing_key
    start_synapse
    start_dashboard_backend
    start_dashboard_frontend
    start_cloudflare_tunnel
    health_report
    next_steps
}

main "$@"
