#!/bin/bash

# Cloudflare Tunnel 设置脚本
# 适用于 Matrix Synapse 内网 + Cloudflare Tunnel 部署
#
# 使用方法：
# ./setup_cloudflared.sh setup     # 安装和配置 cloudflared
# ./setup_cloudflared.sh tunnel    # 创建和配置 tunnel
# ./setup_cloudflared.sh dns       # 配置 DNS 记录
# ./setup_cloudflared.sh service   # 安装为系统服务
# ./setup_cloudflared.sh test      # 测试连接
# ./setup_cloudflared.sh all       # 执行所有步骤

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 配置变量（请根据实际情况修改）
MATRIX_DOMAIN="matrix.your-domain.com"
DASHBOARD_DOMAIN="dashboard.your-domain.com"
TUNNEL_NAME="matrix-tunnel"
CONFIG_DIR="$HOME/.cloudflared"
SYSTEM_CONFIG_DIR="/etc/cloudflared"
CLOUDFLARED_VERSION="latest"
PROJECT_ROOT="/home/shijian/projects/privchat-synapse"

# 检查命令行参数
if [[ $# -eq 0 ]]; then
    echo "用法: $0 [setup|tunnel|dns|service|test|all]"
    echo
    echo "选项:"
    echo "  setup    - 安装 cloudflared"
    echo "  tunnel   - 创建 tunnel"
    echo "  dns      - 配置 DNS 记录"
    echo "  service  - 安装为系统服务"
    echo "  test     - 测试连接"
    echo "  all      - 执行所有步骤"
    exit 1
fi

# 获取架构
get_arch() {
    case $(uname -m) in
        x86_64) echo "amd64" ;;
        aarch64) echo "arm64" ;;
        armv7l) echo "arm" ;;
        *) echo "unknown" ;;
    esac
}

# 获取系统信息
get_system_info() {
    ARCH=$(get_arch)
    if [[ "$ARCH" == "unknown" ]]; then
        log_error "不支持的架构: $(uname -m)"
        exit 1
    fi

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        PLATFORM="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="darwin"
    else
        log_error "不支持的操作系统: $OSTYPE"
        exit 1
    fi

    log_info "检测到系统: $PLATFORM-$ARCH"
}

# 检查是否以 root 权限运行（仅服务安装需要）
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此操作需要 root 权限运行"
        log_info "请使用: sudo $0 $1"
        exit 1
    fi
}

# 安装 cloudflared
install_cloudflared() {
    log_step "安装 cloudflared..."

    get_system_info

    # 检查是否已安装
    if command -v cloudflared &> /dev/null; then
        log_info "cloudflared 已安装，版本: $(cloudflared --version)"
        return
    fi

    # 下载 cloudflared
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/${CLOUDFLARED_VERSION}/download/cloudflared-${PLATFORM}-${ARCH}"

    log_info "下载 cloudflared 从: $DOWNLOAD_URL"

    if [[ "$PLATFORM" == "linux" ]]; then
        # Linux 安装方法
        if command -v wget &> /dev/null; then
            wget -q "$DOWNLOAD_URL" -O cloudflared
        elif command -v curl &> /dev/null; then
            curl -L "$DOWNLOAD_URL" -o cloudflared
        else
            log_error "需要 wget 或 curl 来下载 cloudflared"
            exit 1
        fi

        chmod +x cloudflared
        sudo mv cloudflared /usr/local/bin/

        # 安装 systemd 服务
        cloudflared service install
    else
        # macOS 安装方法
        if command -v brew &> /dev/null; then
            brew install cloudflared
        else
            log_error "在 macOS 上请使用 brew 安装 cloudflared"
            exit 1
        fi
    fi

    # 验证安装
    cloudflared --version
    log_info "✓ cloudflared 安装完成"
}

# 登录 Cloudflare 账户
login_cloudflare() {
    log_step "登录 Cloudflare 账户..."

    if [[ -f "$CONFIG_DIR/default-cert.pem" ]]; then
        log_info "已发现 Cloudflare 证书，跳过登录"
        return
    fi

    log_info "请在浏览器中登录您的 Cloudflare 账户..."
    cloudflared tunnel login

    if [[ -f "$CONFIG_DIR/default-cert.pem" ]]; then
        log_info "✓ Cloudflare 登录成功"
    else
        log_error "✗ Cloudflare 登录失败"
        exit 1
    fi
}

# 创建 tunnel
create_tunnel() {
    log_step "创建 Cloudflare Tunnel: $TUNNEL_NAME"

    # 检查是否已存在
    if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
        log_warn "Tunnel '$TUNNEL_NAME' 已存在，将使用现有 tunnel"
        TUNNEL_UUID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $2}')
        log_info "使用现有 Tunnel UUID: $TUNNEL_UUID"
        return
    fi

    # 创建新的 tunnel
    log_info "创建新 tunnel..."
    TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME")
    TUNNEL_UUID=$(echo "$TUNNEL_OUTPUT" | grep "Created tunnel" | awk '{print $3}')

    if [[ -z "$TUNNEL_UUID" ]]; then
        log_error "创建 tunnel 失败"
        exit 1
    fi

    log_info "✓ Tunnel 创建成功"
    log_info "Tunnel UUID: $TUNNEL_UUID"

    # 保存 UUID 到文件
    echo "$TUNNEL_UUID" > "$CONFIG_DIR/tunnel_uuid.txt"
    log_info "Tunnel UUID 已保存到: $CONFIG_DIR/tunnel_uuid.txt"
}

# 生成配置文件
generate_config() {
    log_step "生成 cloudflared 配置文件..."

    # 获取 tunnel UUID
    if [[ -f "$CONFIG_DIR/tunnel_uuid.txt" ]]; then
        TUNNEL_UUID=$(cat "$CONFIG_DIR/tunnel_uuid.txt")
    else
        # 尝试从列表中获取
        TUNNEL_UUID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $2}')
    fi

    if [[ -z "$TUNNEL_UUID" ]]; then
        log_error "找不到 tunnel UUID，请先运行 tunnel 创建步骤"
        exit 1
    fi

    # 创建配置目录
    mkdir -p "$CONFIG_DIR"

    # 生成配置文件
    cat > "$CONFIG_DIR/config.yml" << EOF
# Cloudflare Tunnel 配置 - Matrix Synapse
# 生成时间: $(date)
# Tunnel 名称: $TUNNEL_NAME
# Tunnel UUID: $TUNNEL_UUID

tunnel: $TUNNEL_UUID
credentials-file: $CONFIG_DIR/${TUNNEL_UUID}.json

# 入站路由配置
ingress:
  # Matrix 服务器主隧道
  - hostname: $MATRIX_DOMAIN
    service: http://127.0.0.1:8008
    originRequest:
      connectTimeout: 30s
      tlsTimeout: 10s
      noHappyEyeballs: false
      keepAliveConnections: 100
      httpHostHeader: $MATRIX_DOMAIN

  # Dashboard 管理界面隧道
  - hostname: $DASHBOARD_DOMAIN
    service: http://127.0.0.1:3001
    originRequest:
      connectTimeout: 30s
      tlsTimeout: 10s
      noHappyEyeballs: false

  # 健康检查端点
  - hostname: $MATRIX_DOMAIN
    path: /health
    service: http://127.0.0.1:8088

  # 默认规则：拒绝其他请求
  - service: http_status:404

# 全局配置
originRequest:
  connectTimeout: 30s
  tlsTimeout: 10s
  noHappyEyeballs: false
  keepAliveConnections: 100
  httpHostHeader: $MATRIX_DOMAIN
  # 对于联邦流量，可能需要禁用 TLS 验证
  # noTLSVerify: true
EOF

    log_info "✓ 配置文件已生成: $CONFIG_DIR/config.yml"
}

# 配置 DNS 记录
configure_dns() {
    log_step "配置 DNS 记录..."

    # 获取 tunnel UUID
    if [[ -f "$CONFIG_DIR/tunnel_uuid.txt" ]]; then
        TUNNEL_UUID=$(cat "$CONFIG_DIR/tunnel_uuid.txt")
    else
        TUNNEL_UUID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $2}')
    fi

    if [[ -z "$TUNNEL_UUID" ]]; then
        log_error "找不到 tunnel UUID，请先运行 tunnel 创建步骤"
        exit 1
    fi

    # 配置 Matrix 域名
    log_info "配置 Matrix 域名: $MATRIX_DOMAIN"
    cloudflared tunnel route dns "$TUNNEL_UUID" "$MATRIX_DOMAIN"

    # 配置 Dashboard 域名
    log_info "配置 Dashboard 域名: $DASHBOARD_DOMAIN"
    cloudflared tunnel route dns "$TUNNEL_UUID" "$DASHBOARD_DOMAIN"

    log_info "✓ DNS 记录配置完成"
    log_info "请在 Cloudflare Dashboard 中验证 DNS 记录已正确添加"
}

# 安装为系统服务
install_service() {
    check_root "service"

    log_step "安装 cloudflared 为系统服务..."

    # 创建系统配置目录
    mkdir -p "$SYSTEM_CONFIG_DIR"

    # 复制配置文件
    if [[ -f "$CONFIG_DIR/config.yml" ]]; then
        cp "$CONFIG_DIR/config.yml" "$SYSTEM_CONFIG_DIR/"
        log_info "✓ 配置文件已复制到: $SYSTEM_CONFIG_DIR/config.yml"
    else
        log_error "找不到配置文件: $CONFIG_DIR/config.yml"
        exit 1
    fi

    # 复制凭据文件
    if [[ -f "$CONFIG_DIR/tunnel_uuid.txt" ]]; then
        TUNNEL_UUID=$(cat "$CONFIG_DIR/tunnel_uuid.txt")
        if [[ -f "$CONFIG_DIR/${TUNNEL_UUID}.json" ]]; then
            cp "$CONFIG_DIR/${TUNNEL_UUID}.json" "$SYSTEM_CONFIG_DIR/"
            log_info "✓ 凭据文件已复制"
        fi
    fi

    # 设置权限
    chown -R root:cloudflared "$SYSTEM_CONFIG_DIR" 2>/dev/null || chown -R root:root "$SYSTEM_CONFIG_DIR"
    chmod 600 "$SYSTEM_CONFIG_DIR"/*.json 2>/dev/null || true
    chmod 644 "$SYSTEM_CONFIG_DIR/config.yml"

    # 安装 systemd 服务
    if command -v systemctl &> /dev/null; then
        # 重新安装服务以使用新的配置
        cloudflared service uninstall
        cloudflared service install

        # 启用和启动服务
        systemctl enable cloudflared
        systemctl start cloudflared

        # 检查服务状态
        if systemctl is-active --quiet cloudflared; then
            log_info "✓ cloudflared 服务已启动"
            systemctl status cloudflared --no-pager
        else
            log_error "✗ cloudflared 服务启动失败"
            systemctl status cloudflared --no-pager
            exit 1
        fi
    else
        log_warn "systemctl 不可用，请手动配置 cloudflared 服务"
    fi
}

# 测试连接
test_connection() {
    log_step "测试 tunnel 连接..."

    # 等待服务启动
    sleep 5

    # 检查本地服务是否运行
    if ! curl -s http://127.0.0.1:8008/health > /dev/null 2>&1; then
        log_warn "本地 Synapse 服务未运行在 127.0.0.1:8008"
        log_warn "请确保 Synapse 服务已启动"
    else
        log_info "✓ 本地 Synapse 服务运行正常"
    fi

    # 测试通过 tunnel 的连接
    log_info "测试 Matrix 域名连接: $MATRIX_DOMAIN"
    if curl -s --max-time 10 "https://$MATRIX_DOMAIN/health" > /dev/null 2>&1; then
        log_info "✓ Matrix 域名通过 tunnel 连接正常"
    else
        log_warn "Matrix 域名连接失败，可能还在启动中"
    fi

    # 测试 Dashboard 连接
    log_info "测试 Dashboard 域名连接: $DASHBOARD_DOMAIN"
    if curl -s --max-time 10 "https://$DASHBOARD_DOMAIN" > /dev/null 2>&1; then
        log_info "✓ Dashboard 域名通过 tunnel 连接正常"
    else
        log_warn "Dashboard 域名连接失败，Dashboard 服务可能未启动"
    fi

    # 测试 .well-known 配置
    log_info "测试 .well-known/server 配置..."
    if curl -s --max-time 10 "https://$MATRIX_DOMAIN/.well-known/matrix/server" | grep -q "m.server"; then
        log_info "✓ .well-known/server 配置正确"
    else
        log_warn ".well-known/server 配置可能有问题"
        log_warn "请检查 Cloudflare Worker 或本地配置"
    fi

    log_info "测试完成！"
    log_info "如果某些测试失败，请等待几分钟让 DNS 和 tunnel 完全生效"
}

# 显示状态
show_status() {
    log_step "显示当前状态..."

    # 显示 cloudflared 版本
    if command -v cloudflared &> /dev/null; then
        log_info "cloudflared 版本: $(cloudflared --version)"
    else
        log_error "cloudflared 未安装"
        return
    fi

    # 显示 tunnel 列表
    log_info "当前 tunnel 列表:"
    cloudflared tunnel list

    # 显示 DNS 记录
    if [[ -f "$CONFIG_DIR/tunnel_uuid.txt" ]]; then
        TUNNEL_UUID=$(cat "$CONFIG_DIR/tunnel_uuid.txt")
        log_info "Tunnel DNS 记录:"
        cloudflared tunnel route dns "$TUNNEL_UUID" 2>/dev/null || log_warn "无法获取 DNS 记录"
    fi

    # 显示服务状态
    if command -v systemctl &> /dev/null; then
        if systemctl is-active --quiet cloudflared; then
            log_info "✓ cloudflared 服务运行中"
        else
            log_warn "cloudflared 服务未运行"
        fi
    fi
}

# 显示帮助信息
show_help() {
    echo
    echo "Matrix Synapse + Cloudflare Tunnel 部署指南"
    echo
    echo "部署前准备:"
    echo "1. 确保域名已添加到 Cloudflare"
    echo "2. 确保已安装 Matrix Synapse"
    echo "3. 确保 Synapse 运行在 127.0.0.1:8008"
    echo
    echo "完整部署流程:"
    echo "  1. sudo $0 setup     # 安装 cloudflared"
    echo "  2. $0 tunnel         # 创建 tunnel"
    echo "  3. $0 dns            # 配置 DNS"
    echo "  4. sudo $0 service   # 安装为系统服务"
    echo "  5. $0 test           # 测试连接"
    echo "  或者: sudo $0 all     # 执行所有步骤"
    echo
    echo "配置文件位置:"
    echo "  用户配置: $CONFIG_DIR/config.yml"
    echo "  系统配置: $SYSTEM_CONFIG_DIR/config.yml"
    echo
    echo "服务管理:"
    echo "  启动服务: sudo systemctl start cloudflared"
    echo "  停止服务: sudo systemctl stop cloudflared"
    echo "  重启服务: sudo systemctl restart cloudflared"
    echo "  查看状态: sudo systemctl status cloudflared"
    echo "  查看日志: sudo journalctl -u cloudflared -f"
    echo
    echo "域名配置:"
    echo "  Matrix 服务器: $MATRIX_DOMAIN"
    echo "  Dashboard 界面: $DASHBOARD_DOMAIN"
    echo
    echo "端口配置:"
    echo "  Synapse 主服务: 127.0.0.1:8008"
    echo "  Dashboard 服务: 127.0.0.1:3001"
    echo "  健康检查服务: 127.0.0.1:8088"
}

# 主执行逻辑
case "$1" in
    setup)
        install_cloudflared
        login_cloudflare
        ;;
    tunnel)
        login_cloudflare
        create_tunnel
        generate_config
        ;;
    dns)
        configure_dns
        ;;
    service)
        install_service
        ;;
    test)
        test_connection
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    all)
        log_info "执行完整的 cloudflared 设置流程..."
        install_cloudflared
        login_cloudflare
        create_tunnel
        generate_config
        configure_dns
        install_service
        test_connection
        show_status
        log_info "✓ cloudflared 设置完成！"
        ;;
    *)
        log_error "未知选项: $1"
        echo "使用 '$0 help' 查看帮助信息"
        exit 1
        ;;
esac