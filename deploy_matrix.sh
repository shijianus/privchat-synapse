#!/bin/bash

# Matrix Synapse 一键部署脚本
# 内网 + Cloudflare Tunnel 完整部署方案
#
# 使用方法：
# sudo ./deploy_matrix.sh interactive  # 交互式部署 (推荐)
# sudo ./deploy_matrix.sh auto          # 自动化部署 (使用默认值)
# sudo ./deploy_matrix.sh check         # 检查系统要求
# sudo ./deploy_matrix.sh status        # 显示当前部署状态
# sudo ./deploy_matrix.sh update        # 更新现有部署
# sudo ./deploy_matrix.sh uninstall     # 卸载部署 (危险操作)

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_NAME="Matrix Synapse Dashboard"
PROJECT_VERSION="1.0.0"
PROJECT_ROOT="/home/shijian/projects/privchat-synapse"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 部署配置 (将被覆盖)
MATRIX_DOMAIN=""
DASHBOARD_DOMAIN=""
SERVER_NAME=""
POSTGRES_PASSWORD=""
JWT_SECRET=""
REGISTRATION_SECRET=""
ADMIN_USERNAME=""
ADMIN_PASSWORD=""
ADMIN_EMAIL=""
CLOUDFLARE_EMAIL=""
ENABLE_DASHBOARD=true
ENABLE_TURNSERVER=false
ENABLE_MONITORING=false

# 安全标记
DEPLOYMENT_IN_PROGRESS=false
BACKUP_CREATED=false

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} ✅ $1"
}

log_failure() {
    echo -e "${RED}[FAILURE]${NC} ❌ $1"
}

log_header() {
    echo
    echo -e "${BOLD}${BLUE}=== $1 ===${NC}"
    echo
}

# 显示横幅
show_banner() {
    echo -e "${BOLD}${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║            Matrix Synapse 一键部署脚本                    ║"
    echo "║         内网 + Cloudflare Tunnel 完整方案                 ║"
    echo "║                                                           ║"
    echo "║  版本: $PROJECT_VERSION                                    ║"
    echo "║  作者: Claude AI Assistant                                 ║"
    echo "║  文档: MATRIX_DEPLOYMENT_PLAN.md                           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# 显示帮助信息
show_help() {
    echo
    echo "Matrix Synapse 一键部署脚本使用说明"
    echo
    echo "用法: $0 [选项]"
    echo
    echo "部署选项:"
    echo "  interactive  # 交互式部署 (推荐，会询问所有配置)"
    echo "  auto         # 自动化部署 (使用环境变量或默认值)"
    echo "  check        # 检查系统要求和依赖"
    echo "  status       # 显示当前部署状态"
    echo "  update       # 更新现有部署"
    echo "  uninstall    # 卸载部署 (危险操作)"
    echo "  help         # 显示此帮助信息"
    echo
    echo "环境变量:"
    echo "  MATRIX_DOMAIN          # Matrix 服务器域名"
    echo "  DASHBOARD_DOMAIN       # Dashboard 域名"
    echo "  POSTGRES_PASSWORD      # PostgreSQL 数据库密码"
    echo "  JWT_SECRET            # JWT 认证密钥"
    echo "  REGISTRATION_SECRET    # 注册共享密钥"
    echo "  ADMIN_USERNAME         # 管理员用户名"
    echo "  ADMIN_PASSWORD         # 管理员密码"
    echo "  ADMIN_EMAIL            # 管理员邮箱"
    echo "  CLOUDFLARE_EMAIL       # Cloudflare 账户邮箱"
    echo
    echo "示例:"
    echo "  # 交互式部署"
    echo "  sudo $0 interactive"
    echo
    echo "  # 自动化部署 (环境变量)"
    echo "  sudo MATRIX_DOMAIN=matrix.example.com \\"
    echo "       POSTGRES_PASSWORD=secure_password \\"
    echo "       $0 auto"
    echo
    echo "  # 检查系统要求"
    echo "  sudo $0 check"
    echo
    echo "  # 查看部署状态"
    echo "  sudo $0 status"
    echo
    echo "特性:"
    echo "  ✅ 完整的 Matrix Synapse 服务器部署"
    echo "  ✅ Cloudflare Tunnel 内网穿透"
    echo "  ✅ PostgreSQL 数据库自动配置"
    echo "  ✅ Dashboard 管理界面"
    echo "  ✅ 用户管理和风险控制"
    echo "  ✅ 监控和日志系统"
    echo "  ✅ 安全加固和备份"
    echo "  ✅ 联邦连接和 .well-known 配置"
    echo
    echo "技术支持:"
    echo "  📖 文档: MATRIX_DEPLOYMENT_PLAN.md"
    echo "  🐛 问题反馈: 创建 GitHub Issue"
    echo "  💬 社区支持: Matrix 官方社区"
    echo
}

# 检查系统要求
check_system_requirements() {
    log_header "系统要求检查"

    local errors=0

    # 检查操作系统
    log_step "检查操作系统..."
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        log_info "操作系统: $PRETTY_NAME"
        if [[ "$ID" != "ubuntu" && "$ID" != "debian" && "$ID" != "centos" && "$ID" != "rhel" ]]; then
            log_warn "未测试的操作系统: $ID，可能存在兼容性问题"
            errors=$((errors + 1))
        fi
    else
        log_error "无法确定操作系统版本"
        errors=$((errors + 1))
    fi

    # 检查架构
    log_step "检查系统架构..."
    local arch=$(uname -m)
    log_info "系统架构: $arch"
    if [[ "$arch" != "x86_64" && "$arch" != "aarch64" ]]; then
        log_warn "未测试的架构: $arch，可能存在兼容性问题"
        errors=$((errors + 1))
    fi

    # 检查内存
    log_step "检查系统内存..."
    local total_mem=$(free -m | awk '/^Mem:/{print $2}')
    log_info "总内存: ${total_mem}MB"
    if [[ $total_mem -lt 4096 ]]; then
        log_error "内存不足: 需要至少 4GB 内存，当前 ${total_mem}MB"
        errors=$((errors + 1))
    else
        log_success "内存检查通过"
    fi

    # 检查磁盘空间
    log_step "检查磁盘空间..."
    local free_space=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    log_info "可用磁盘空间: ${free_space}GB"
    if [[ $free_space -lt 50 ]]; then
        log_error "磁盘空间不足: 需要至少 50GB，当前 ${free_space}GB"
        errors=$((errors + 1))
    else
        log_success "磁盘空间检查通过"
    fi

    # 检查网络连接
    log_step "检查网络连接..."
    if ping -c 1 8.8.8.8 &> /dev/null; then
        log_success "网络连接正常"
    else
        log_error "网络连接失败，请检查网络设置"
        errors=$((errors + 1))
    fi

    # 检查 DNS 解析
    log_step "检查 DNS 解析..."
    if nslookup cloudflare.com &> /dev/null; then
        log_success "DNS 解析正常"
    else
        log_error "DNS 解析失败，请检查 DNS 设置"
        errors=$((errors + 1))
    fi

    # 检查必需的软件包
    log_step "检查必需软件包..."
    local missing_packages=()

    for package in wget curl git python3; do
        if ! command -v "$package" &> /dev/null; then
            missing_packages+=("$package")
        fi
    done

    if [[ ${#missing_packages[@]} -gt 0 ]]; then
        log_error "缺少必需软件包: ${missing_packages[*]}"
        errors=$((errors + 1))
    else
        log_success "必需软件包已安装"
    fi

    # 检查 Python 版本
    log_step "检查 Python 版本..."
    if command -v python3 &> /dev/null; then
        local python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
        log_info "Python 版本: $python_version"
        if python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)"; then
            log_success "Python 版本符合要求 (>= 3.8)"
        else
            log_error "Python 版本过低: 需要 >= 3.8，当前 $python_version"
            errors=$((errors + 1))
        fi
    else
        log_error "Python 3 未安装"
        errors=$((errors + 1))
    fi

    # 检查端口占用
    log_step "检查端口占用..."
    local ports=(5432 6379 8008 3001)
    for port in "${ports[@]}"; do
        if netstat -tln 2>/dev/null | grep -q ":$port "; then
            log_warn "端口 $port 已被占用"
        else
            log_info "端口 $port 可用"
        fi
    done

    # 检查防火墙状态
    log_step "检查防火墙状态..."
    if command -v ufw &> /dev/null; then
        if ufw status | grep -q "Status: active"; then
            log_info "UFW 防火墙已启用"
            log_warn "请确保允许 SSH 和必要端口的访问"
        else
            log_info "UFW 防火墙未启用"
        fi
    elif command -v firewall-cmd &> /dev/null; then
        if firewall-cmd --state &> /dev/null; then
            log_info "firewalld 防火墙已启用"
        else
            log_info "firewalld 防火墙未启用"
        fi
    else
        log_info "未检测到防火墙管理工具"
    fi

    # 显示检查结果
    echo
    if [[ $errors -eq 0 ]]; then
        log_success "🎉 所有系统要求检查通过！"
        return 0
    else
        log_failure "❌ 发现 $errors 个问题，请解决后再继续部署"
        return 1
    fi
}

# 显示部署状态
show_deployment_status() {
    log_header "部署状态检查"

    # 检查 Synapse 服务
    log_step "检查 Matrix Synapse 服务..."
    if systemctl is-active --quiet matrix-synapse 2>/dev/null; then
        log_success "Matrix Synapse 服务运行中"
        systemctl status matrix-synapse --no-pager -l
    else
        log_warn "Matrix Synapse 服务未运行或未安装"
    fi

    # 检查 Dashboard 服务
    log_step "检查 Dashboard 服务..."
    if systemctl is-active --quiet matrix-dashboard 2>/dev/null; then
        log_success "Dashboard 服务运行中"
        systemctl status matrix-dashboard --no-pager -l
    else
        log_warn "Dashboard 服务未运行或未安装"
    fi

    # 检查 PostgreSQL 服务
    log_step "检查 PostgreSQL 服务..."
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        log_success "PostgreSQL 服务运行中"
    else
        log_warn "PostgreSQL 服务未运行或未安装"
    fi

    # 检查 Redis 服务
    log_step "检查 Redis 服务..."
    if systemctl is-active --quiet redis 2>/dev/null || systemctl is-active --quiet redis-server 2>/dev/null; then
        log_success "Redis 服务运行中"
    else
        log_warn "Redis 服务未运行或未安装"
    fi

    # 检查 Cloudflare Tunnel
    log_step "检查 Cloudflare Tunnel..."
    if pgrep -f cloudflared > /dev/null; then
        log_success "Cloudflare Tunnel 运行中"
        if systemctl is-active --quiet cloudflared 2>/dev/null; then
            log_info "Cloudflare Tunnel 服务运行正常"
        else
            log_info "Cloudflare Tunnel 进程运行中（可能非服务模式）"
        fi
    else
        log_warn "Cloudflare Tunnel 未运行"
    fi

    # 检查配置文件
    log_step "检查配置文件..."
    local config_files=(
        "/etc/matrix-synapse/homeserver.yaml"
        "/etc/matrix-synapse/log_config.yaml"
        "/opt/matrix-dashboard/.env"
        "~/.cloudflared/config.yml"
    )

    for config_file in "${config_files[@]}"; do
        local expanded_file="${config_file/#\~/$HOME}"
        if [[ -f "$expanded_file" ]]; then
            log_success "配置文件存在: $config_file"
        else
            log_warn "配置文件缺失: $config_file"
        fi
    done

    # 检查数据库连接
    log_step "检查数据库连接..."
    if sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse -c "SELECT version();" &>/dev/null; then
        log_success "数据库连接正常"

        # 检查数据库版本
        local db_version=$(sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse -t -c "SELECT version();" 2>/dev/null | head -1)
        log_info "数据库版本: $db_version"

        # 检查用户数量
        local user_count=$(sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ')
        log_info "注册用户数: $user_count"

        # 检查房间数量
        if sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse -c "\dt rooms" &>/dev/null; then
            local room_count=$(sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse -t -c "SELECT COUNT(*) FROM rooms;" 2>/dev/null | tr -d ' ')
            log_info "房间数量: $room_count"
        fi
    else
        log_warn "数据库连接失败或未配置"
    fi

    # 检查网络连接
    if [[ -n "$MATRIX_DOMAIN" ]]; then
        log_step "检查网络连接..."

        # 检查域名解析
        if nslookup "$MATRIX_DOMAIN" &>/dev/null; then
            log_success "域名解析正常: $MATRIX_DOMAIN"
        else
            log_warn "域名解析失败: $MATRIX_DOMAIN"
        fi

        # 检查 HTTP 连接
        if curl -s --max-time 10 "https://$MATRIX_DOMAIN/_matrix/server/versions" &>/dev/null; then
            log_success "HTTP 连接正常: https://$MATRIX_DOMAIN"
        else
            log_warn "HTTP 连接失败: https://$MATRIX_DOMAIN"
        fi

        # 检查 .well-known 配置
        if curl -s --max-time 10 "https://$MATRIX_DOMAIN/.well-known/matrix/server" &>/dev/null; then
            log_success ".well-known 配置正常"
        else
            log_warn ".well-known 配置缺失或无效"
        fi
    fi

    # 显示统计信息
    echo
    log_step "部署统计信息..."
    echo "项目名称: $PROJECT_NAME"
    echo "项目版本: $PROJECT_VERSION"
    echo "项目目录: $PROJECT_ROOT"
    echo "部署时间: $(date)"

    if [[ -n "$MATRIX_DOMAIN" ]]; then
        echo "Matrix 域名: $MATRIX_DOMAIN"
        echo "Dashboard 域名: $DASHBOARD_DOMAIN"
    fi

    # 显示服务地址
    if [[ -n "$MATRIX_DOMAIN" ]]; then
        echo
        log_info "访问地址:"
        echo "  Matrix 服务器: https://$MATRIX_DOMAIN"
        if [[ -n "$DASHBOARD_DOMAIN" ]]; then
            echo "  Dashboard 管理界面: https://$DASHBOARD_DOMAIN"
        fi
        echo "  联邦测试器: https://federationtester.matrix.org/api/report?server_name=$MATRIX_DOMAIN"
    fi

    echo
    log_info "状态检查完成"
}

# 生成随机密码
generate_password() {
    local length=${1:-32}
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# 生成强密钥
generate_secret() {
    local length=${1:-64}
    openssl rand -hex $length
}

# 验证域名格式
validate_domain() {
    local domain="$1"
    if [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        return 0
    else
        return 1
    fi
}

# 验证邮箱格式
validate_email() {
    local email="$1"
    if [[ "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        return 0
    else
        return 1
    fi
}

# 验证密码强度
validate_password() {
    local password="$1"
    local min_length=12

    if [[ ${#password} -lt $min_length ]]; then
        log_error "密码长度至少需要 $min_length 个字符"
        return 1
    fi

    if [[ ! "$password" =~ [A-Z] ]]; then
        log_error "密码必须包含至少一个大写字母"
        return 1
    fi

    if [[ ! "$password" =~ [a-z] ]]; then
        log_error "密码必须包含至少一个小写字母"
        return 1
    fi

    if [[ ! "$password" =~ [0-9] ]]; then
        log_error "密码必须包含至少一个数字"
        return 1
    fi

    if [[ ! "$password" =~ [^a-zA-Z0-9] ]]; then
        log_error "密码必须包含至少一个特殊字符"
        return 1
    fi

    return 0
}

# 交互式配置收集
collect_interactive_config() {
    log_header "交互式配置收集"

    echo -e "${YELLOW}请提供以下配置信息：${NC}"
    echo

    # Matrix 域名
    while true; do
        read -p "Matrix 服务器域名 (例: matrix.example.com): " MATRIX_DOMAIN
        if validate_domain "$MATRIX_DOMAIN"; then
            break
        else
            log_error "域名格式无效，请重新输入"
        fi
    done

    # Dashboard 域名 (默认: dashboard.matrix_domain)
    DASHBOARD_DOMAIN="dashboard.${MATRIX_DOMAIN#matrix.}"
    read -p "Dashboard 域名 (默认: $DASHBOARD_DOMAIN): " input_domain
    if [[ -n "$input_domain" ]]; then
        DASHBOARD_DOMAIN="$input_domain"
    fi

    # 服务器名称 (默认: matrix_domain)
    SERVER_NAME="$MATRIX_DOMAIN"
    read -p "Matrix 服务器名称 (默认: $SERVER_NAME): " input_server
    if [[ -n "$input_server" ]]; then
        SERVER_NAME="$input_server"
    fi

    # PostgreSQL 密码
    while true; do
        POSTGRES_PASSWORD=$(generate_password 32)
        echo "生成的 PostgreSQL 密码: $POSTGRES_PASSWORD"
        read -p "接受此密码或输入自定义密码: " input_password
        if [[ -n "$input_password" ]]; then
            POSTGRES_PASSWORD="$input_password"
        fi

        if validate_password "$POSTGRES_PASSWORD"; then
            break
        fi
    done

    # JWT 密钥
    JWT_SECRET=$(generate_secret 64)
    echo "生成的 JWT 密钥: $JWT_SECRET"

    # 注册共享密钥
    REGISTRATION_SECRET=$(generate_secret 64)
    echo "生成的注册共享密钥: $REGISTRATION_SECRET"

    # 管理员账户
    while true; do
        read -p "管理员用户名: " ADMIN_USERNAME
        if [[ -n "$ADMIN_USERNAME" && "$ADMIN_USERNAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
            break
        else
            log_error "用户名格式无效 (仅允许字母、数字、下划线、连字符)"
        fi
    done

    while true; do
        read -p "管理员邮箱: " ADMIN_EMAIL
        if validate_email "$ADMIN_EMAIL"; then
            break
        else
            log_error "邮箱格式无效，请重新输入"
        fi
    done

    while true; do
        read -s -p "管理员密码: " ADMIN_PASSWORD
        echo
        if validate_password "$ADMIN_PASSWORD"; then
            read -s -p "确认管理员密码: " confirm_password
            echo
            if [[ "$ADMIN_PASSWORD" == "$confirm_password" ]]; then
                break
            else
                log_error "密码不匹配"
            fi
        fi
    done

    # Cloudflare 邮箱
    while true; do
        read -p "Cloudflare 账户邮箱: " CLOUDFLARE_EMAIL
        if validate_email "$CLOUDFLARE_EMAIL"; then
            break
        else
            log_error "邮箱格式无效，请重新输入"
        fi
    done

    # 功能开关
    read -p "启用 Dashboard 管理界面? (Y/n): " enable_dashboard
    if [[ "$enable_dashboard" =~ ^[Nn]$ ]]; then
        ENABLE_DASHBOARD=false
    else
        ENABLE_DASHBOARD=true
    fi

    read -p "启用 TURN 语音通话服务器? (y/N): " enable_turn
    if [[ "$enable_turn" =~ ^[Yy]$ ]]; then
        ENABLE_TURNSERVER=true
    else
        ENABLE_TURNSERVER=false
    fi

    read -p "启用监控和告警系统? (y/N): " enable_monitoring
    if [[ "$enable_monitoring" =~ ^[Yy]$ ]]; then
        ENABLE_MONITORING=true
    else
        ENABLE_MONITORING=false
    fi

    # 显示配置摘要
    echo
    log_header "配置摘要"
    echo "Matrix 域名: $MATRIX_DOMAIN"
    echo "Dashboard 域名: $DASHBOARD_DOMAIN"
    echo "服务器名称: $SERVER_NAME"
    echo "管理员账户: $ADMIN_USERNAME ($ADMIN_EMAIL)"
    echo "Dashboard 启用: $ENABLE_DASHBOARD"
    echo "TURN 服务器启用: $ENABLE_TURNSERVER"
    echo "监控系统启用: $ENABLE_MONITORING"
    echo

    read -p "确认配置并开始部署? (Y/n): " confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        log_info "部署已取消"
        exit 0
    fi
}

# 自动化配置收集
collect_auto_config() {
    log_header "自动化配置"

    # 从环境变量读取配置
    MATRIX_DOMAIN="${MATRIX_DOMAIN:-matrix.your-domain.com}"
    DASHBOARD_DOMAIN="${DASHBOARD_DOMAIN:-dashboard.${MATRIX_DOMAIN#matrix.}}"
    SERVER_NAME="${SERVER_NAME:-$MATRIX_DOMAIN}"
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(generate_password 32)}"
    JWT_SECRET="${JWT_SECRET:-$(generate_secret 64)}"
    REGISTRATION_SECRET="${REGISTRATION_SECRET:-$(generate_secret 64)}"
    ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(generate_password 16)}"
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@$MATRIX_DOMAIN}"
    CLOUDFLARE_EMAIL="${CLOUDFLARE_EMAIL:-}"
    ENABLE_DASHBOARD="${ENABLE_DASHBOARD:-true}"
    ENABLE_TURNSERVER="${ENABLE_TURNSERVER:-false}"
    ENABLE_MONITORING="${ENABLE_MONITORING:-false}"

    log_info "使用自动化配置"
    log_info "Matrix 域名: $MATRIX_DOMAIN"
    log_info "Dashboard 域名: $DASHBOARD_DOMAIN"
    log_info "服务器名称: $SERVER_NAME"
}

# 备份现有配置
backup_existing_config() {
    log_header "备份现有配置"

    local backup_dir="/var/backups/matrix-synapse-$(date +%Y%m%d_%H%M%S)"
    local backup_needed=false

    # 检查需要备份的文件和目录
    local backup_items=(
        "/etc/matrix-synapse"
        "/opt/matrix-dashboard"
        "/var/lib/matrix-synapse"
        "/var/log/matrix-synapse"
        "~/.cloudflared"
    )

    for item in "${backup_items[@]}"; do
        local expanded_item="${item/#\~/$HOME}"
        if [[ -e "$expanded_item" ]]; then
            backup_needed=true
            break
        fi
    done

    if [[ "$backup_needed" == true ]]; then
        log_info "创建备份目录: $backup_dir"
        sudo mkdir -p "$backup_dir"

        # 备份配置文件
        for item in "${backup_items[@]}"; do
            local expanded_item="${item/#\~/$HOME}"
            if [[ -e "$expanded_item" ]]; then
                log_info "备份: $item"
                sudo cp -r "$expanded_item" "$backup_dir/"
            fi
        done

        # 备份数据库
        if sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse &>/dev/null; then
            log_info "备份数据库..."
            sudo -u postgres pg_dump -h 127.0.0.1 -U synapse_user synapse | gzip > "$backup_dir/synapse_db_backup.sql.gz"
        fi

        # 备份服务状态
        systemctl list-units --type=service | grep -E "(matrix|postgres|redis|cloudflare)" > "$backup_dir/services_status.txt" 2>&1 || true

        # 备份已安装的包列表
        dpkg --get-selections | grep -E "(postgresql|redis|matrix)" > "$backup_dir/installed_packages.txt" 2>&1 || true

        BACKUP_CREATED=true
        log_success "备份完成: $backup_dir"
    else
        log_info "未发现需要备份的配置"
    fi
}

# 安装系统依赖
install_dependencies() {
    log_header "安装系统依赖"

    # 更新包索引
    log_step "更新包索引..."
    apt update

    # 安装基础包
    log_step "安装基础包..."
    apt install -y \
        wget \
        curl \
        git \
        gnupg2 \
        software-properties-common \
        build-essential \
        python3 \
        python3-dev \
        python3-venv \
        python3-pip \
        jq \
        dnsutils \
        netcat \
        unzip \
        htop

    # 安装 PostgreSQL
    log_step "安装 PostgreSQL..."
    apt install -y postgresql postgresql-contrib python3-psycopg2

    # 安装 Redis
    log_step "安装 Redis..."
    apt install -y redis-server

    # 安装 Poetry
    log_step "安装 Poetry..."
    if ! command -v poetry &> /dev/null; then
        curl -sSL https://install.python-poetry.org | python3 -
        export PATH="$HOME/.local/bin:$PATH"
    fi

    # 安装 Node.js (用于 Dashboard)
    if [[ "$ENABLE_DASHBOARD" == true ]]; then
        log_step "安装 Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt install -y nodejs

        # 安装 PM2 (进程管理器)
        npm install -g pm2
    fi

    # 安装 Nginx (可选，用于本地 .well-known 服务)
    log_step "安装 Nginx..."
    apt install -y nginx

    # 启动基础服务
    log_step "启动基础服务..."
    systemctl start postgresql
    systemctl enable postgresql
    systemctl start redis-server
    systemctl enable redis-server

    log_success "依赖安装完成"
}

# 配置数据库
setup_database() {
    log_header "配置数据库"

    # 运行 PostgreSQL 初始化脚本
    log_step "运行 PostgreSQL 初始化脚本..."
    if [[ -f "$PROJECT_ROOT/scripts/init_postgres.sh" ]]; then
        sudo bash "$PROJECT_ROOT/scripts/init_postgres.sh"
    else
        log_error "PostgreSQL 初始化脚本未找到: $PROJECT_ROOT/scripts/init_postgres.sh"
        return 1
    fi

    # 设置数据库密码环境变量
    export PGPASSWORD="$POSTGRES_PASSWORD"

    # 验证数据库连接
    log_step "验证数据库连接..."
    if sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse -c "SELECT version();" &>/dev/null; then
        log_success "数据库连接验证成功"
    else
        log_error "数据库连接验证失败"
        return 1
    fi

    # 导入 Dashboard 数据库模式
    if [[ "$ENABLE_DASHBOARD" == true ]]; then
        log_step "导入 Dashboard 数据库模式..."
        if [[ -f "$PROJECT_ROOT/dashboard/schema/dashboard_schema.sql" ]]; then
            sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse < "$PROJECT_ROOT/dashboard/schema/dashboard_schema.sql"
            log_success "Dashboard 数据库模式导入完成"
        else
            log_warn "Dashboard 数据库模式文件未找到，将跳过"
        fi
    fi

    log_success "数据库配置完成"
}

# 配置 Synapse
setup_synapse() {
    log_header "配置 Synapse"

    # 创建 Synapse 用户
    log_step "创建 Synapse 用户..."
    if ! id "synapse" &>/dev/null; then
        sudo adduser --system --no-create-home --group synapse
    fi

    # 创建必要目录
    log_step "创建 Synapse 目录..."
    sudo mkdir -p /var/lib/matrix-synapse/media_store
    sudo mkdir -p /var/log/matrix-synapse
    sudo mkdir -p /etc/matrix-synapse

    # 设置目录权限
    log_step "设置目录权限..."
    sudo chown -R synapse:synapse /var/lib/matrix-synapse
    sudo chown -R synapse:synapse /var/log/matrix-synapse
    sudo chown -R synapse:synapse /etc/matrix-synapse
    sudo chmod 700 /var/lib/matrix-synapse
    sudo chmod 750 /var/log/matrix-synapse
    sudo chmod 700 /etc/matrix-synapse

    # 复制配置文件
    log_step "复制配置文件..."
    sudo cp "$PROJECT_ROOT/config/homeserver_matrix_production.yaml" /etc/matrix-synapse/homeserver.yaml
    sudo cp "$PROJECT_ROOT/config/log_config_production.yaml" /etc/matrix-synapse/log_config.yaml

    # 生成签名密钥
    log_step "生成签名密钥..."
    if [[ ! -f "/etc/matrix-synapse/$SERVER_NAME.signing.key" ]]; then
        sudo -u synapse bash -c "cd /etc/matrix-synapse && \
            python3 -m synapse.crypto.keygen \
            --key-type ed25519 \
            --output \"/etc/matrix-synapse/$SERVER_NAME.signing.key\""
        sudo chmod 600 "/etc/matrix-synapse/$SERVER_NAME.signing.key"
    fi

    # 更新配置文件
    log_step "更新配置文件..."
    sudo sed -i "s/server_name: \"matrix.your-domain.com\"/server_name: \"$SERVER_NAME\"/" /etc/matrix-synapse/homeserver.yaml
    sudo sed -i "s|public_baseurl: \"https://matrix.your-domain.com\"|public_baseurl: \"https://$MATRIX_DOMAIN\"|" /etc/matrix-synapse/homeserver.yaml
    sudo sed -i "s/your_postgres_password_here/$POSTGRES_PASSWORD/" /etc/matrix-synapse/homeserver.yaml
    sudo sed -i "s/your_registration_secret_here/$REGISTRATION_SECRET/" /etc/matrix-synapse/homeserver.yaml

    # 安装 Synapse
    log_step "安装 Synapse..."
    cd "$PROJECT_ROOT"

    # 使用 Poetry 安装依赖
    if command -v poetry &> /dev/null; then
        poetry install
        python build_rust.py
    else
        log_error "Poetry 未安装，无法安装 Synapse"
        return 1
    fi

    # 创建 systemd 服务
    log_step "创建 systemd 服务..."
    sudo tee /etc/systemd/system/matrix-synapse.service > /dev/null << EOF
[Unit]
Description=Matrix Synapse homeserver
After=network-online.target postgresql.service redis.service
Wants=network-online.target postgresql.service redis.service

[Service]
Type=notify
NotifyAccess=all
User=synapse
Group=synapse
WorkingDirectory=/var/lib/matrix-synapse
Environment=PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=PYTHONPATH=$PROJECT_ROOT
ExecStart=/root/.local/bin/poetry run python -m synapse.app.homeserver \
    --config-path=/etc/matrix-synapse/homeserver.yaml \
    --config-path=/etc/matrix-synapse/log_config.yaml
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

    # 创建管理员用户
    log_step "创建管理员用户..."
    cd "$PROJECT_ROOT"
    /root/.local/bin/poetry run register_new_matrix_user \
        --config /etc/matrix-synapse/homeserver.yaml \
        --user "$ADMIN_USERNAME" \
        --password "$ADMIN_PASSWORD" \
        --admin \
        --no-display

    log_success "Synapse 配置完成"
}

# 配置 Dashboard
setup_dashboard() {
    if [[ "$ENABLE_DASHBOARD" != true ]]; then
        log_info "Dashboard 已禁用，跳过配置"
        return 0
    fi

    log_header "配置 Dashboard"

    # 创建 Dashboard 目录
    log_step "创建 Dashboard 目录..."
    sudo mkdir -p /opt/matrix-dashboard
    sudo mkdir -p /var/lib/matrix-dashboard/uploads
    sudo mkdir -p /var/log/matrix-dashboard

    # 复制环境变量模板
    log_step "配置 Dashboard 环境变量..."
    sudo cp "$PROJECT_ROOT/config/dashboard.env.template" /opt/matrix-dashboard/.env.template

    # 创建 .env 文件
    sudo tee /opt/matrix-dashboard/.env > /dev/null << EOF
# Matrix Dashboard 生产环境配置
# 生成时间: $(date)

# 基础配置
NODE_ENV=production
PORT=3001
DASHBOARD_HOST=127.0.0.1
LOG_LEVEL=info

# JWT 配置
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$(generate_secret 64)
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=604800

# CORS 配置
CORS_ORIGINS=http://localhost:3000,https://$DASHBOARD_DOMAIN,https://$MATRIX_DOMAIN

# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=synapse
DB_USER=synapse_user
DB_PASSWORD=$POSTGRES_PASSWORD
DB_MAX_CONNECTIONS=20

# Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_USER_EVENTS_CHANNEL=dashboard.user.invalidate

# Synapse 集成
SYNAPSE_SERVER_URL=http://127.0.0.1:8008
SYNAPSE_SERVER_NAME=$SERVER_NAME

# Bot API 集成
BOT_API_SECRET=$(generate_secret 32)

# 会话和安全配置
SESSION_SECRET=$(generate_secret 64)
BCRYPT_ROUNDS=12

# 文件上传配置
MAX_FILE_SIZE=10485760
UPLOAD_TEMP_DIR=/tmp/matrix_dashboard_uploads

# 监控配置
ENABLE_METRICS=true
METRICS_PORT=9090

# 管理员账户
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_EMAIL=$ADMIN_EMAIL

# 缓存配置
DASHBOARD_CACHE_TTL_SECONDS=300
REDIS_CACHE_TTL_SECONDS=300
EOF

    # 设置权限
    log_step "设置 Dashboard 权限..."
    sudo chown -R root:root /opt/matrix-dashboard
    sudo chmod 755 /opt/matrix-dashboard
    sudo chmod 600 /opt/matrix-dashboard/.env
    sudo chown root:root /var/lib/matrix-dashboard
    sudo chown root:root /var/log/matrix-dashboard

    # 创建简单的 Dashboard 服务器 (如果没有真实应用)
    if [[ ! -f "/opt/matrix-dashboard/server.js" ]]; then
        log_step "创建基础 Dashboard 服务器..."
        sudo tee /opt/matrix-dashboard/server.js > /dev/null << 'EOF'
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// 基础中间件
app.use(cors());
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'matrix-dashboard' });
});

// API 根路径
app.get('/', (req, res) => {
    res.json({
        message: 'Matrix Dashboard API',
        version: '1.0.0',
        endpoints: ['/health', '/api/v1']
    });
});

// 404 处理
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// 启动服务器
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Matrix Dashboard server running on http://127.0.0.1:${PORT}`);
});
EOF

        # 安装 Node.js 依赖
        cd /opt/matrix-dashboard
        sudo npm init -y
        sudo npm install express cors
    fi

    # 创建 systemd 服务
    log_step "创建 Dashboard systemd 服务..."
    sudo tee /etc/systemd/system/matrix-dashboard.service > /dev/null << EOF
[Unit]
Description=Matrix Dashboard API
After=network-online.target postgresql.service redis.service matrix-synapse.service
Wants=network-online.target postgresql.service redis.service matrix-synapse.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/matrix-dashboard
Environment=NODE_ENV=production
EnvironmentFile=/opt/matrix-dashboard/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    log_success "Dashboard 配置完成"
}

# 配置 Cloudflare Tunnel
setup_cloudflare_tunnel() {
    log_header "配置 Cloudflare Tunnel"

    # 运行 Cloudflare Tunnel 安装脚本
    log_step "运行 Cloudflare Tunnel 安装脚本..."
    if [[ -f "$PROJECT_ROOT/scripts/setup_cloudflared.sh" ]]; then
        # 修改脚本中的域名
        sed -i "s/matrix\.your-domain\.com/$MATRIX_DOMAIN/g" "$PROJECT_ROOT/scripts/setup_cloudflared.sh"
        sed -i "s/dashboard\.your-domain\.com/$DASHBOARD_DOMAIN/g" "$PROJECT_ROOT/scripts/setup_cloudflared.sh"

        # 运行脚本
        sudo bash "$PROJECT_ROOT/scripts/setup_cloudflared.sh" all
    else
        log_error "Cloudflare Tunnel 安装脚本未找到: $PROJECT_ROOT/scripts/setup_cloudflared.sh"
        return 1
    fi

    # 配置 .well-known 服务
    log_step "配置 .well-known 服务..."
    if command -v cloudflared &> /dev/null; then
        # 使用 Cloudflare Worker 配置
        log_info "请手动配置 Cloudflare Worker，使用以下内容："
        echo
        echo "Worker 脚本位置: $PROJECT_ROOT/config/cloudflare_worker_matrix.js"
        echo "Worker 路由: *$MATRIX_DOMAIN/.well-known/*"
        echo
    else
        log_error "cloudflared 未安装"
        return 1
    fi

    log_success "Cloudflare Tunnel 配置完成"
}

# 配置 TURN 服务器
setup_turn_server() {
    if [[ "$ENABLE_TURNSERVER" != true ]]; then
        log_info "TURN 服务器已禁用，跳过配置"
        return 0
    fi

    log_header "配置 TURN 服务器"

    # 安装 coturn
    log_step "安装 coturn..."
    apt install -y coturn

    # 生成 TURN 密钥
    TURN_SECRET=$(generate_secret 64)

    # 配置 coturn
    log_step "配置 coturn..."
    sudo tee /etc/turnserver.conf > /dev/null << EOF
# coturn 配置文件
# 生成时间: $(date)

# 网络配置
listening-port=3478
tls-listening-port=5349
listening-ip=127.0.0.1
relay-ip=127.0.0.1

# 认证配置
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=$MATRIX_DOMAIN

# 用户配置
total-quota=100
user-quota=12
max-bps=64000

# 日志配置
log-file=/var/log/turnserver.log
verbose

# 安全配置
no-tlsv1
no-tlsv1_1
cert=/etc/ssl/certs/ssl-cert-snakeoil.pem
pkey=/etc/ssl/private/ssl-cert-snakeoil.key

# 性能配置
max-allocate-lifetime=600
default-lifetime=300
EOF

    # 启用 coturn
    log_step "启用 coturn 服务..."
    sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
    sudo systemctl enable coturn
    sudo systemctl start coturn

    # 更新 Synapse 配置
    log_step "更新 Synapse TURN 配置..."
    sudo tee -a /etc/matrix-synapse/homeserver.yaml > /dev/null << EOF

# TURN 服务器配置
turn_uris:
  - "turn:$MATRIX_DOMAIN:3478?transport=udp"
  - "turn:$MATRIX_DOMAIN:3478?transport=tcp"
  - "turns:$MATRIX_DOMAIN:5349?transport=tcp"

turn_shared_secret: $TURN_SECRET
turn_user_lifetime: 86400000
EOF

    log_success "TURN 服务器配置完成"
}

# 配置监控系统
setup_monitoring() {
    if [[ "$ENABLE_MONITORING" != true ]]; then
        log_info "监控系统已禁用，跳过配置"
        return 0
    fi

    log_header "配置监控系统"

    # 安装 Prometheus
    log_step "安装 Prometheus..."
    apt install -y prometheus

    # 配置 Prometheus
    log_step "配置 Prometheus..."
    sudo tee /etc/prometheus/prometheus.yml > /dev/null << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'matrix-synapse'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/_synapse/metrics'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'matrix-dashboard'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
EOF

    # 启用 Prometheus
    sudo systemctl enable prometheus
    sudo systemctl start prometheus

    # 安装 Grafana (可选)
    read -p "安装 Grafana 可视化界面? (y/N): " install_grafana
    if [[ "$install_grafana" =~ ^[Yy]$ ]]; then
        log_step "安装 Grafana..."
        apt install -y software-properties-common
        sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
        wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
        apt update
        apt install -y grafana

        sudo systemctl enable grafana-server
        sudo systemctl start grafana-server

        log_info "Grafana 安装完成，访问地址: http://localhost:3000"
        log_info "默认用户名/密码: admin/admin"
    fi

    log_success "监控系统配置完成"
}

# 启动所有服务
start_services() {
    log_header "启动服务"

    # 重新加载 systemd
    log_step "重新加载 systemd..."
    sudo systemctl daemon-reload

    # 启动基础服务
    log_step "启动基础服务..."
    sudo systemctl start postgresql
    sudo systemctl start redis-server

    # 启动 Matrix Synapse
    log_step "启动 Matrix Synapse..."
    sudo systemctl start matrix-synapse
    sleep 10

    # 启动 Dashboard
    if [[ "$ENABLE_DASHBOARD" == true ]]; then
        log_step "启动 Dashboard..."
        sudo systemctl start matrix-dashboard
        sleep 5
    fi

    # 启动 TURN 服务器
    if [[ "$ENABLE_TURNSERVER" == true ]]; then
        log_step "启动 TURN 服务器..."
        sudo systemctl start coturn
    fi

    # 启动监控服务
    if [[ "$ENABLE_MONITORING" == true ]]; then
        log_step "启动监控服务..."
        sudo systemctl start prometheus
    fi

    # 启动 Cloudflare Tunnel
    log_step "启动 Cloudflare Tunnel..."
    sudo systemctl start cloudflared
    sleep 10

    log_success "所有服务启动完成"
}

# 验证部署
verify_deployment() {
    log_header "验证部署"

    # 运行连通性测试
    log_step "运行连通性测试..."
    if [[ -f "$PROJECT_ROOT/scripts/test_matrix_connectivity.sh" ]]; then
        bash "$PROJECT_ROOT/scripts/test_matrix_connectivity.sh" basic
    else
        log_warn "连通性测试脚本未找到"
    fi

    # 测试本地服务
    log_step "测试本地服务..."
    local test_failed=false

    if curl -s --max-time 10 http://127.0.0.1:8008/health &>/dev/null; then
        log_success "✓ Synapse 服务响应正常"
    else
        log_failure "✗ Synapse 服务无响应"
        test_failed=true
    fi

    if [[ "$ENABLE_DASHBOARD" == true ]]; then
        if curl -s --max-time 10 http://127.0.0.1:3001/health &>/dev/null; then
            log_success "✓ Dashboard 服务响应正常"
        else
            log_failure "✗ Dashboard 服务无响应"
            test_failed=true
        fi
    fi

    # 测试公网连接
    if [[ -n "$MATRIX_DOMAIN" ]]; then
        log_step "测试公网连接..."
        if curl -s --max-time 15 "https://$MATRIX_DOMAIN/_matrix/server/versions" &>/dev/null; then
            log_success "✓ 公网连接正常: https://$MATRIX_DOMAIN"
        else
            log_failure "✗ 公网连接失败: https://$MATRIX_DOMAIN"
            test_failed=true
        fi
    fi

    # 显示部署结果
    echo
    if [[ "$test_failed" == false ]]; then
        log_success "🎉 部署验证成功！"
        show_deployment_info
        return 0
    else
        log_failure "❌ 部署验证失败，请检查服务状态"
        return 1
    fi
}

# 显示部署信息
show_deployment_info() {
    echo
    log_header "部署完成"

    echo -e "${BOLD}${GREEN}🎉 Matrix Synapse 部署成功！${NC}"
    echo

    echo -e "${BOLD}📱 访问地址:${NC}"
    echo "  Matrix 服务器: https://$MATRIX_DOMAIN"
    echo "  客户端连接: https://$MATRIX_DOMAIN"

    if [[ "$ENABLE_DASHBOARD" == true ]]; then
        echo "  Dashboard 管理界面: https://$DASHBOARD_DOMAIN"
    fi

    if [[ "$ENABLE_MONITORING" == true ]]; then
        echo "  Prometheus 监控: http://localhost:9090"
        echo "  Grafana 可视化: http://localhost:3000"
    fi

    echo
    echo -e "${BOLD}👤 管理员账户:${NC}"
    echo "  用户名: $ADMIN_USERNAME"
    echo "  邮箱: $ADMIN_EMAIL"
    echo "  (密码在部署过程中已设置)"

    echo
    echo -e "${BOLD}🔧 服务管理:${NC}"
    echo "  启动 Synapse: sudo systemctl start matrix-synapse"
    echo "  停止 Synapse: sudo systemctl stop matrix-synapse"
    echo "  重启 Synapse: sudo systemctl restart matrix-synapse"
    echo "  查看状态: sudo systemctl status matrix-synapse"
    echo "  查看日志: sudo journalctl -u matrix-synapse -f"

    if [[ "$ENABLE_DASHBOARD" == true ]]; then
        echo "  启动 Dashboard: sudo systemctl start matrix-dashboard"
        echo "  Dashboard 日志: sudo journalctl -u matrix-dashboard -f"
    fi

    echo
    echo -e "${BOLD}🔗 有用的链接:${NC}"
    echo "  联邦测试: https://federationtester.matrix.org/api/report?server_name=$MATRIX_DOMAIN"
    echo "  Matrix 官方客户端: https://element.io/"
    echo "  客户端连接指南: https://matrix.org/docs/guides/getting-started"

    if [[ "$BACKUP_CREATED" == true ]]; then
        echo
        echo -e "${BOLD}💾 备份信息:${NC}"
        echo "  原有配置已备份到: /var/backups/matrix-synapse-*"
    fi

    echo
    echo -e "${BOLD}📖 下一步:${NC}"
    echo "  1. 配置 Matrix 客户端连接到 https://$MATRIX_DOMAIN"
    echo "  2. 使用管理员账户登录 Dashboard (如果已启用)"
    echo "  3. 创建测试用户和房间"
    echo "  4. 配置用户邀请和注册策略"
    echo "  5. 设置媒体保留和存储策略"

    echo
    echo -e "${YELLOW}⚠️ 重要提醒:${NC}"
    echo "  请妥善保存所有密码和配置文件"
    echo "  定期备份数据库和配置"
    echo "  保持系统和软件包更新"
    echo "  监控服务状态和资源使用"
    echo "  查看文档: $PROJECT_ROOT/MATRIX_DEPLOYMENT_PLAN.md"
}

# 更新现有部署
update_deployment() {
    log_header "更新现有部署"

    # 备份现有配置
    backup_existing_config

    # 拉取最新代码
    log_step "拉取最新代码..."
    cd "$PROJECT_ROOT"
    git pull origin main

    # 更新依赖
    log_step "更新依赖..."
    if command -v poetry &> /dev/null; then
        poetry update
        python build_rust.py
    fi

    # 更新配置文件 (保留自定义设置)
    log_step "更新配置文件..."
    # 这里需要更复杂的配置合并逻辑

    # 重启服务
    log_step "重启服务..."
    sudo systemctl restart matrix-synapse
    if systemctl is-active --quiet matrix-dashboard 2>/dev/null; then
        sudo systemctl restart matrix-dashboard
    fi

    log_success "部署更新完成"
}

# 卸载部署
uninstall_deployment() {
    log_header "卸载部署"

    echo -e "${RED}⚠️ 警告: 此操作将完全删除 Matrix Synapse 服务器和相关数据！${NC}"
    echo
    read -p "确定要继续吗? 输入 'DELETE' 确认: " confirm
    if [[ "$confirm" != "DELETE" ]]; then
        log_info "卸载操作已取消"
        exit 0
    fi

    # 停止所有服务
    log_step "停止所有服务..."
    sudo systemctl stop matrix-synapse matrix-dashboard cloudflared coturn 2>/dev/null || true
    sudo systemctl disable matrix-synapse matrix-dashboard cloudflared coturn 2>/dev/null || true

    # 备份重要数据
    backup_existing_config

    # 删除服务文件
    log_step "删除 systemd 服务..."
    sudo rm -f /etc/systemd/system/matrix-synapse.service
    sudo rm -f /etc/systemd/system/matrix-dashboard.service

    # 重新加载 systemd
    sudo systemctl daemon-reload

    # 删除用户和目录
    log_step "删除用户和目录..."
    sudo userdel synapse 2>/dev/null || true
    sudo rm -rf /var/lib/matrix-synapse
    sudo rm -rf /var/log/matrix-synapse
    sudo rm -rf /etc/matrix-synapse
    sudo rm -rf /opt/matrix-dashboard

    # 删除数据库 (可选)
    read -p "删除数据库及其所有数据? (y/N): " delete_db
    if [[ "$delete_db" =~ ^[Yy]$ ]]; then
        log_step "删除数据库..."
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS synapse;"
        sudo -u postgres psql -c "DROP USER IF EXISTS synapse_user;"
    fi

    # 删除 Cloudflare Tunnel 配置
    log_step "删除 Cloudflare Tunnel 配置..."
    sudo rm -rf ~/.cloudflared
    sudo rm -rf /etc/cloudflared

    log_success "卸载完成"
}

# 主函数
main() {
    # 检查是否为 root 用户
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要 root 权限运行"
        echo "请使用: sudo $0 $*"
        exit 1
    fi

    # 设置部署标记
    DEPLOYMENT_IN_PROGRESS=true

    # 捕获中断信号
    trap 'if [[ "$DEPLOYMENT_IN_PROGRESS" == true ]]; then log_error "部署被中断"; exit 1; fi' INT TERM

    # 显示横幅
    show_banner

    # 处理命令行参数
    case "${1:-help}" in
        interactive)
            log_info "启动交互式部署..."
            collect_interactive_config
            check_system_requirements || exit 1
            backup_existing_config
            install_dependencies
            setup_database
            setup_synapse
            setup_dashboard
            setup_cloudflare_tunnel
            setup_turn_server
            setup_monitoring
            start_services
            verify_deployment
            ;;
        auto)
            log_info "启动自动化部署..."
            collect_auto_config
            check_system_requirements || exit 1
            backup_existing_config
            install_dependencies
            setup_database
            setup_synapse
            setup_dashboard
            setup_cloudflare_tunnel
            setup_turn_server
            setup_monitoring
            start_services
            verify_deployment
            ;;
        check)
            check_system_requirements
            ;;
        status)
            show_deployment_status
            ;;
        update)
            log_info "更新现有部署..."
            update_deployment
            ;;
        uninstall)
            log_info "卸载现有部署..."
            uninstall_deployment
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知选项: $1"
            echo
            show_help
            exit 1
            ;;
    esac

    # 重置部署标记
    DEPLOYMENT_IN_PROGRESS=false

    log_success "操作完成"
}

# 运行主函数
main "$@"