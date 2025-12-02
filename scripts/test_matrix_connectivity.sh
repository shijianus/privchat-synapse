#!/bin/bash

# Matrix Synapse 连通性测试脚本
# 适用于内网 + Cloudflare Tunnel 部署方案
#
# 使用方法：
# ./test_matrix_connectivity.sh basic       # 基础连接测试
# ./test_matrix_connectivity.sh federation  # 联邦测试
# ./test_matrix_connectivity.sh client      # 客户端测试
# ./test_matrix_connectivity.sh tunnel      # Tunnel 测试
# ./test_matrix_connectivity.sh dashboard   # Dashboard 测试
# ./test_matrix_connectivity.sh all         # 执行所有测试

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

log_test() {
    echo -e "${PURPLE}[TEST]${NC} $1"
}

log_result() {
    echo -e "${CYAN}[RESULT]${NC} $1"
}

# 配置变量（请根据实际情况修改）
MATRIX_DOMAIN="matrix.your-domain.com"
DASHBOARD_DOMAIN="dashboard.your-domain.com"
SERVER_NAME="matrix.your-domain.com"
LOCAL_SERVER="127.0.0.1:8008"
LOCAL_DASHBOARD="127.0.0.1:3001"
HEALTH_ENDPOINT="127.0.0.1:8088"

# 测试结果统计
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# 测试结果记录
test_result() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if [[ "$expected" == "$actual" ]]; then
        log_result "✓ PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_result "✗ FAIL: $test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# 显示测试统计
show_test_stats() {
    echo
    echo "=================================="
    echo "测试统计"
    echo "=================================="
    log_result "总测试数: $TESTS_TOTAL"
    log_result "通过: $TESTS_PASSED"
    log_result "失败: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_info "🎉 所有测试通过！"
        return 0
    else
        log_error "❌ 有 $TESTS_FAILED 个测试失败"
        return 1
    fi
}

# 检查必要工具
check_tools() {
    log_step "检查必要的测试工具..."

    local missing_tools=()

    for tool in curl jq dig nc; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done

    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "缺少必要工具: ${missing_tools[*]}"
        log_info "请安装缺少的工具:"
        log_info "  Ubuntu/Debian: sudo apt install curl jq dnsutils netcat"
        log_info "  CentOS/RHEL: sudo yum install curl jq bind-utils nmap-ncat"
        exit 1
    fi

    log_info "✓ 所有必要的测试工具已安装"
}

# 测试本地服务
test_local_services() {
    log_step "测试本地 Synapse 服务..."

    # 测试主服务
    if curl -s --max-time 5 "http://$LOCAL_SERVER/health" &> /dev/null; then
        test_result "本地 Synapse 主服务 (8008)" "0" "0"
    else
        test_result "本地 Synapse 主服务 (8008)" "1" "0"
        log_warn "Synapse 主服务可能未启动"
    fi

    # 测试健康检查端点
    if curl -s --max-time 5 "http://$HEALTH_ENDPOINT/health" &> /dev/null; then
        test_result "健康检查服务 (8088)" "0" "0"
    else
        test_result "健康检查服务 (8088)" "1" "0"
        log_warn "健康检查服务可能未配置"
    fi

    # 测试 Dashboard 服务
    if curl -s --max-time 5 "http://$LOCAL_DASHBOARD" &> /dev/null; then
        test_result "本地 Dashboard 服务 (3001)" "0" "0"
    else
        test_result "本地 Dashboard 服务 (3001)" "1" "0"
        log_warn "Dashboard 服务可能未启动"
    fi
}

# 测试 DNS 解析
test_dns_resolution() {
    log_step "测试 DNS 解析..."

    # 测试 Matrix 域名解析
    if dig +short "$MATRIX_DOMAIN" A | grep -q '.'; then
        test_result "Matrix 域名 DNS 解析" "0" "0"
        log_info "Matrix 域名解析到: $(dig +short "$MATRIX_DOMAIN" A | head -n1)"
    else
        test_result "Matrix 域名 DNS 解析" "1" "0"
    fi

    # 测试 Dashboard 域名解析
    if dig +short "$DASHBOARD_DOMAIN" A | grep -q '.'; then
        test_result "Dashboard 域名 DNS 解析" "0" "0"
        log_info "Dashboard 域名解析到: $(dig +short "$DASHBOARD_DOMAIN" A | head -n1)"
    else
        test_result "Dashboard 域名 DNS 解析" "1" "0"
    fi

    # 检查 MX 记录（可选）
    if dig +short "$MATRIX_DOMAIN" MX | grep -q '.'; then
        log_info "MX 记录: $(dig +short "$MATRIX_DOMAIN" MX)"
    else
        log_warn "未找到 MX 记录（邮件功能可能受限）"
    fi

    # 检查 SPF 记录（可选）
    if dig +short "$MATRIX_DOMAIN" TXT | grep -q "v=spf1"; then
        log_info "SPF 记录: $(dig +short "$MATRIX_DOMAIN" TXT | grep spf1)"
    else
        log_warn "未找到 SPF 记录（邮件发送可能受限）"
    fi
}

# 测试 .well-known 配置
test_well_known() {
    log_step "测试 .well-known 配置..."

    # 测试服务器发现
    log_test "测试 .well-known/matrix/server"
    local server_response=$(curl -s --max-time 10 "https://$MATRIX_DOMAIN/.well-known/matrix/server" 2>/dev/null || echo '{}')

    if echo "$server_response" | jq -e '.["m.server"]' &> /dev/null; then
        local server_value=$(echo "$server_response" | jq -r '.["m.server"]')
        test_result ".well-known/matrix/server 配置" "0" "0"
        log_info "服务器发现: $server_value"
    else
        test_result ".well-known/matrix/server 配置" "1" "0"
        log_error "服务器发现配置失败"
        log_error "响应: $server_response"
    fi

    # 测试客户端发现
    log_test "测试 .well-known/matrix/client"
    local client_response=$(curl -s --max-time 10 "https://$MATRIX_DOMAIN/.well-known/matrix/client" 2>/dev/null || echo '{}')

    if echo "$client_response" | jq -e '.["m.homeserver"]' &> /dev/null; then
        local client_value=$(echo "$client_response" | jq -r '.["m.homeserver"].base_url')
        test_result ".well-known/matrix/client 配置" "0" "0"
        log_info "客户端发现: $client_value"
    else
        test_result ".well-known/matrix/client 配置" "1" "0"
        log_error "客户端发现配置失败"
        log_error "响应: $client_response"
    fi
}

# 测试 HTTP 连接性
test_http_connectivity() {
    log_step "测试 HTTP 连接性..."

    # 测试 Matrix 服务器主页
    if curl -s --max-time 10 -I "https://$MATRIX_DOMAIN" | grep -q "200 OK\|404 Not Found"; then
        test_result "Matrix 服务器 HTTP 连接" "0" "0"
    else
        test_result "Matrix 服务器 HTTP 连接" "1" "0"
    fi

    # 测试 Matrix API 端点
    if curl -s --max-time 10 "https://$MATRIX_DOMAIN/_matrix/server/versions" | grep -q "versions"; then
        test_result "Matrix API 端点" "0" "0"
        log_info "Matrix 服务器版本: $(curl -s "https://$MATRIX_DOMAIN/_matrix/server/versions" | jq -r '.versions[0] // "unknown"' 2>/dev/null)"
    else
        test_result "Matrix API 端点" "1" "0"
    fi

    # 测试 Dashboard 连接
    if curl -s --max-time 10 -I "https://$DASHBOARD_DOMAIN" | grep -q "200 OK\|404 Not Found"; then
        test_result "Dashboard HTTP 连接" "0" "0"
    else
        test_result "Dashboard HTTP 连接" "1" "0"
    fi
}

# 测试联邦连接
test_federation() {
    log_step "测试联邦连接..."

    # 测试服务器密钥
    log_test "测试服务器密钥端点"
    local key_response=$(curl -s --max-time 10 "https://$MATRIX_DOMAIN/_matrix/key/v2/server" 2>/dev/null || echo '{}')

    if echo "$key_response" | jq -e '.server_name' &> /dev/null; then
        local server_name=$(echo "$key_response" | jq -r '.server_name')
        test_result "服务器密钥端点" "0" "0"
        log_info "服务器名称: $server_name"
    else
        test_result "服务器密钥端点" "1" "0"
        log_error "服务器密钥获取失败"
    fi

    # 测试联邦版本端点
    if curl -s --max-time 10 -X POST "https://$MATRIX_DOMAIN/_matrix/federation/v1/version" \
        -H "Content-Type: application/json" \
        -d '{"method":"GET","uri":"_matrix/federation/v1/version","origin":"matrix.org","destination":"'$MATRIX_DOMAIN'"}' &> /dev/null; then
        test_result "联邦版本端点" "0" "0"
    else
        test_result "联邦版本端点" "1" "0"
        log_warn "联邦版本测试失败（可能需要正确的认证）"
    fi

    # 测试 Federation Tester（在线服务）
    log_test "测试 Federation Tester 连接"
    local federation_test=$(curl -s --max-time 15 "https://federationtester.matrix.org/api/report?server_name=$MATRIX_DOMAIN" 2>/dev/null || echo '{}')

    if echo "$federation_test" | jq -e '.FederationOK' &> /dev/null; then
        local federation_ok=$(echo "$federation_test" | jq -r '.FederationOK')
        test_result "Federation Tester" "$federation_ok" "true"
        if [[ "$federation_ok" != "true" ]]; then
            log_error "联邦测试失败原因:"
            echo "$federation_test" | jq -r '.Errors // []' | head -5
        fi
    else
        test_result "Federation Tester" "1" "0"
        log_warn "无法连接到 Federation Tester"
    fi
}

# 测试客户端功能
test_client_features() {
    log_step "测试客户端功能..."

    # 测试公共房间目录（如果允许）
    if curl -s --max-time 10 "https://$MATRIX_DOMAIN/_matrix/client/r0/publicRooms" | grep -q "chunk\|error"; then
        test_result "公共房间目录" "0" "0"
    else
        test_result "公共房间目录" "1" "0"
    fi

    # 测试注册端点（可能被禁用）
    local registration_response=$(curl -s --max-time 10 "https://$MATRIX_DOMAIN/_matrix/client/r0/register" -X POST -H "Content-Type: application/json" -d '{"username":"test","password":"test123"}' 2>/dev/null || echo '{}')

    if echo "$registration_response" | jq -e '.errcode' &> /dev/null; then
        local errcode=$(echo "$registration_response" | jq -r '.errcode')
        if [[ "$errcode" == "M_FORBIDDEN" ]]; then
            test_result "注册端点（预期禁用）" "0" "0"
            log_info "✓ 注册正确地被禁用"
        else
            test_result "注册端点" "1" "0"
            log_error "意外的注册错误: $errcode"
        fi
    else
        test_result "注册端点（意外启用）" "1" "0"
        log_warn "⚠️ 注册功能意外启用"
    fi

    # 测试登录端点（测试错误响应）
    local login_response=$(curl -s --max-time 10 "https://$MATRIX_DOMAIN/_matrix/client/r0/login" -X POST -H "Content-Type: application/json" -d '{"type":"m.login.password","user":"nonexistent","password":"wrong"}' 2>/dev/null || echo '{}')

    if echo "$login_response" | jq -e '.errcode' &> /dev/null; then
        test_result "登录端点响应" "0" "0"
    else
        test_result "登录端点响应" "1" "0"
    fi
}

# 测试 Tunnel 连接性
test_tunnel_connectivity() {
    log_step "测试 Cloudflare Tunnel 连接..."

    # 检查 Tunnel 是否在运行
    if command -v cloudflared &> /dev/null; then
        if pgrep -f cloudflared > /dev/null; then
            test_result "Cloudflare Tunnel 进程" "0" "0"
            log_info "Tunnel 进程 ID: $(pgrep -f cloudflared)"
        else
            test_result "Cloudflare Tunnel 进程" "1" "0"
            log_error "Cloudflare Tunnel 未运行"
        fi

        # 显示 Tunnel 列表
        log_info "配置的 Tunnel 列表:"
        cloudflared tunnel list 2>/dev/null || log_warn "无法获取 Tunnel 列表"
    else
        test_result "Cloudflare Tunnel 安装" "1" "0"
        log_error "Cloudflare Tunnel 未安装"
    fi

    # 测试通过 Tunnel 的延迟
    local tunnel_latency=$(curl -o /dev/null -s --max-time 10 -w "%{time_total}" "https://$MATRIX_DOMAIN/_matrix/server/versions" 2>/dev/null || echo "999")
    if (( $(echo "$tunnel_latency < 5.0" | bc -l) )); then
        test_result "Tunnel 延迟 (< 5s)" "0" "0"
        log_info "Tunnel 延迟: ${tunnel_latency}s"
    else
        test_result "Tunnel 延迟 (< 5s)" "1" "0"
        log_error "Tunnel 延迟过高: ${tunnel_latency}s"
    fi
}

# 测试 Dashboard 连接
test_dashboard_connectivity() {
    log_step "测试 Dashboard 连接..."

    # 测试 Dashboard API 健康检查
    if curl -s --max-time 10 "https://$DASHBOARD_DOMAIN/health" | grep -q "ok\|status"; then
        test_result "Dashboard 健康检查" "0" "0"
    else
        test_result "Dashboard 健康检查" "1" "0"
        log_warn "Dashboard 可能未实现健康检查端点"
    fi

    # 测试 Dashboard 根路径
    if curl -s --max-time 10 -I "https://$DASHBOARD_DOMAIN/" | grep -q "200 OK\|302 Found"; then
        test_result "Dashboard 根路径" "0" "0"
    else
        test_result "Dashboard 根路径" "1" "0"
    fi

    # 测试 CORS 头部
    local cors_headers=$(curl -s --max-time 10 -I "https://$DASHBOARD_DOMAIN/" 2>/dev/null | grep -i "access-control" || echo "")
    if [[ -n "$cors_headers" ]]; then
        test_result "Dashboard CORS 配置" "0" "0"
        log_info "CORS 头部: $cors_headers"
    else
        test_result "Dashboard CORS 配置" "1" "0"
        log_warn "CORS 配置可能缺失"
    fi
}

# 性能测试
test_performance() {
    log_step "执行基本性能测试..."

    # 测试多个并发连接
    log_test "测试并发连接"
    local concurrent_requests=5
    local success_count=0

    for i in $(seq 1 $concurrent_requests); do
        if curl -s --max-time 10 "https://$MATRIX_DOMAIN/_matrix/server/versions" &> /dev/null; then
            success_count=$((success_count + 1))
        fi
    done

    if [[ $success_count -eq $concurrent_requests ]]; then
        test_result "并发连接测试 ($concurrent_requests)" "0" "0"
    else
        test_result "并发连接测试 ($concurrent_requests)" "1" "0"
        log_error "只有 $success_count/$concurrent_requests 连接成功"
    fi

    # 基本加载时间测试
    local load_time=$(curl -o /dev/null -s --max-time 15 -w "%{time_total}" "https://$MATRIX_DOMAIN/_matrix/server/versions" 2>/dev/null || echo "999")
    log_info "页面加载时间: ${load_time}s"
}

# 生成测试报告
generate_report() {
    local report_file="matrix_connectivity_report_$(date +%Y%m%d_%H%M%S).txt"

    cat > "$report_file" << EOF
Matrix Synapse 连通性测试报告
=====================================

测试时间: $(date)
服务器域名: $MATRIX_DOMAIN
Dashboard 域名: $DASHBOARD_DOMAIN
服务器名称: $SERVER_NAME

测试统计:
- 总测试数: $TESTS_TOTAL
- 通过: $TESTS_PASSED
- 失败: $TESTS_FAILED
- 成功率: $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%

网络信息:
- 本地 IP: $(curl -s ifconfig.me 2>/dev/null || echo "unknown")
- Cloudflare IP: $(dig +short "$MATRIX_DOMAIN" | head -n1)

DNS 解析:
Matrix 域名:
$(dig "$MATRIX_DOMAIN" 2>/dev/null || echo "解析失败")

Dashboard 域名:
$(dig "$DASHBOARD_DOMAIN" 2>/dev/null || echo "解析失败")

服务器信息:
- 版本信息: $(curl -s "https://$MATRIX_DOMAIN/_matrix/server/versions" 2>/dev/null | jq '.' 2>/dev/null || echo "获取失败")
- 服务器密钥: $(curl -s "https://$MATRIX_DOMAIN/_matrix/key/v2/server" 2>/dev/null | jq -r '.server_name' 2>/dev/null || echo "获取失败")

建议:
EOF

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo "✅ 所有测试通过，服务器配置正确" >> "$report_file"
    else
        echo "⚠️ 有 $TESTS_FAILED 个测试失败，建议检查相关配置" >> "$report_file"
    fi

    log_info "测试报告已保存到: $report_file"
}

# 显示帮助信息
show_help() {
    echo
    echo "Matrix Synapse 连通性测试工具"
    echo
    echo "用法: $0 [选项]"
    echo
    echo "测试选项:"
    echo "  basic      - 基础连接测试（本地服务、DNS、HTTP）"
    echo "  federation - 联邦连接测试（服务器密钥、联邦测试）"
    echo "  client     - 客户端功能测试（API 端点、注册、登录）"
    echo "  tunnel     - Tunnel 连接性测试"
    echo "  dashboard  - Dashboard 连接测试"
    echo "  performance - 基本性能测试"
    echo "  all        - 执行所有测试"
    echo "  report     - 生成详细测试报告"
    echo
    echo "配置变量（在脚本顶部修改）:"
    echo "  MATRIX_DOMAIN     - Matrix 服务器域名"
    echo "  DASHBOARD_DOMAIN  - Dashboard 域名"
    echo "  SERVER_NAME       - Matrix 服务器名称"
    echo "  LOCAL_SERVER      - 本地 Synapse 地址"
    echo "  LOCAL_DASHBOARD   - 本地 Dashboard 地址"
    echo
    echo "使用示例:"
    echo "  $0 all           # 执行所有测试"
    echo "  $0 basic         # 仅基础测试"
    echo "  $0 federation    # 仅联邦测试"
    echo
    echo "常见问题排查:"
    echo "  1. 本地服务测试失败 -> 检查 Synapse 是否启动"
    echo "  2. DNS 解析失败 -> 检查域名 DNS 配置"
    echo "  3. .well-known 失败 -> 检查 Cloudflare Worker 或 Nginx 配置"
    echo "  4. 联邦测试失败 -> 检查防火墙和端口配置"
    echo "  5. Tunnel 连接失败 -> 检查 cloudflared 服务状态"
}

# 主执行逻辑
case "${1:-help}" in
    basic)
        check_tools
        test_local_services
        test_dns_resolution
        test_http_connectivity
        test_well_known
        show_test_stats
        ;;
    federation)
        check_tools
        test_dns_resolution
        test_well_known
        test_federation
        show_test_stats
        ;;
    client)
        check_tools
        test_http_connectivity
        test_client_features
        show_test_stats
        ;;
    tunnel)
        check_tools
        test_tunnel_connectivity
        show_test_stats
        ;;
    dashboard)
        check_tools
        test_dashboard_connectivity
        show_test_stats
        ;;
    performance)
        check_tools
        test_performance
        ;;
    report)
        generate_report
        ;;
    all)
        log_info "执行完整的连通性测试..."
        check_tools
        test_local_services
        test_dns_resolution
        test_http_connectivity
        test_well_known
        test_federation
        test_client_features
        test_tunnel_connectivity
        test_dashboard_connectivity
        test_performance
        show_test_stats
        generate_report
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "未知选项: $1"
        echo "使用 '$0 help' 查看帮助信息"
        exit 1
        ;;
esac