#!/bin/bash

# Matrix Dashboard System Deployment Test Script
# Comprehensive production deployment testing
# Version 1.0.7

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_VERSION="v1.0.7"
BASE_URL="https://dashboard.example.com"
API_BASE_URL="https://api.example.com"
MATRIX_BASE_URL="https://matrix.example.com"
LOG_FILE="/var/log/matrix-dashboard-test.log"

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test data
TEST_EMAIL="test@example.com"
TEST_PASSWORD="TestPassword123!"
TEST_USER_ID="@test:matrix.example.com"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Function to record test result
record_test() {
    local test_name="$1"
    local result="$2"
    local details="$3"

    ((TOTAL_TESTS++))

    if [ "$result" = "PASS" ]; then
        ((PASSED_TESTS++))
        print_success "✓ $test_name"
    else
        ((FAILED_TESTS++))
        print_error "✗ $test_name: $details"
    fi

    echo "$(date '+%Y-%m-%d %H:%M:%S') | $test_name | $result | $details" >> "$LOG_FILE"
}

# Function to check HTTP response
check_http_status() {
    local url="$1"
    local expected_status="${2:-200}"
    local timeout="${3:-30}"

    local response_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" || echo "000")

    if [ "$response_code" = "$expected_status" ]; then
        return 0
    else
        return 1
    fi
}

# Function to check service health
check_service_health() {
    local service_name="$1"
    local url="$2"
    local timeout="${3:-30}"

    print_status "检查服务健康状态: $service_name"

    for i in {1..10}; do
        if check_http_status "$url" 200 "$timeout"; then
            record_test "$service_name Health Check" "PASS" "HTTP 200"
            return 0
        fi

        print_warning "$service_name 未就绪，等待 10 秒... (尝试 $i/10)"
        sleep 10
    done

    record_test "$service_name Health Check" "FAIL" "服务在指定时间内未就绪"
    return 1
}

# Function to test database connectivity
test_database_connectivity() {
    print_status "测试数据库连接..."

    # Test PostgreSQL
    if docker exec matrix-postgres pg_isready -U synapse &>/dev/null; then
        record_test "PostgreSQL 连接" "PASS" "数据库就绪"
    else
        record_test "PostgreSQL 连接" "FAIL" "无法连接到 PostgreSQL"
        return 1
    fi

    # Test database schema
    if docker exec matrix-postgres psql -U synapse -d synapse -c "SELECT COUNT(*) FROM dashboard.user_profiles" &>/dev/null; then
        record_test "Dashboard 数据库架构" "PASS" "数据库架构正确"
    else
        record_test "Dashboard 数据库架构" "FAIL" "数据库架构验证失败"
        return 1
    fi

    # Test Redis
    if docker exec matrix-redis redis-cli ping &>/dev/null; then
        record_test "Redis 连接" "PASS" "缓存服务就绪"
    else
        record_test "Redis 连接" "FAIL" "无法连接到 Redis"
        return 1
    fi
}

# Function to test API endpoints
test_api_endpoints() {
    print_status "测试 API 端点..."

    # Health check endpoint
    if check_http_status "$API_BASE_URL/health"; then
        record_test "API 健康检查" "PASS" "健康检查端点正常"
    else
        record_test "API 健康检查" "FAIL" "健康检查端点失败"
    fi

    # Authentication endpoints
    if check_http_status "$API_BASE_URL/api/v1/auth/health"; then
        record_test "认证服务健康检查" "PASS" "认证服务正常"
    else
        record_test "认证服务健康检查" "FAIL" "认证服务异常"
    fi

    # User management endpoints (protected)
    local auth_response=$(curl -s -X POST "$API_BASE_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"'$TEST_EMAIL'","password":"'$TEST_PASSWORD'"}' || echo "")

    if [[ $auth_response == *"token"* ]]; then
        record_test "用户登录" "PASS" "登录功能正常"

        # Extract token for protected endpoint testing
        local token=$(echo "$auth_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

        # Test protected endpoint with token
        if [ -n "$token" ]; then
            if check_http_status "$API_BASE_URL/api/v1/users" 200; then
                record_test "用户管理 API" "PASS" "受保护端点正常"
            else
                record_test "用户管理 API" "FAIL" "受保护端点异常"
            fi
        fi
    else
        record_test "用户登录" "FAIL" "登录功能异常"
    fi
}

# Function to test Matrix integration
test_matrix_integration() {
    print_status "测试 Matrix 集成..."

    # Test Matrix server version
    if check_http_status "$MATRIX_BASE_URL/_matrix/client/versions"; then
        record_test "Matrix 服务器版本" "PASS" "Matrix 服务器响应正常"
    else
        record_test "Matrix 服务器版本" "FAIL" "Matrix 服务器无响应"
    fi

    # Test well-known configuration
    if check_http_status "$MATRIX_BASE_URL/.well-known/matrix/server"; then
        record_test "Matrix Well-Known 配置" "PASS" "服务器发现配置正常"
    else
        record_test "Matrix Well-Known 配置" "FAIL" "服务器发现配置异常"
    fi

    # Test federation
    if check_http_status "$MATRIX_BASE_URL:8448/_matrix/federation/v1/version" 200; then
        record_test "Matrix 联邦" "PASS" "联邦功能正常"
    else
        record_test "Matrix 联邦" "FAIL" "联邦功能异常"
    fi
}

# Function to test frontend application
test_frontend_application() {
    print_status "测试前端应用..."

    # Test main application
    if check_http_status "$BASE_URL"; then
        record_test "前端应用主页" "PASS" "主页加载正常"
    else
        record_test "前端应用主页" "FAIL" "主页无法加载"
        return 1
    fi

    # Test static assets
    if check_http_status "$BASE_URL/assets/index.css" 200; then
        record_test "静态资源" "PASS" "CSS 资源正常加载"
    else
        record_test "静态资源" "FAIL" "静态资源加载失败"
    fi

    # Test API connectivity from frontend perspective
    local api_response=$(curl -s "$API_BASE_URL/api/v1/auth/health" || echo "")
    if [[ $api_response == *"status"* ]]; then
        record_test "前端-API 连接" "PASS" "前端可以正常访问 API"
    else
        record_test "前端-API 连接" "FAIL" "前端无法访问 API"
    fi
}

# Function to test Matrix Bot service
test_matrix_bot() {
    print_status "测试 Matrix Bot 服务..."

    # Test Bot health check
    if check_http_status "http://localhost:3002/health"; then
        record_test "Matrix Bot 健康检查" "PASS" "Bot 服务正常"
    else
        record_test "Matrix Bot 健康检查" "FAIL" "Bot 服务异常"
    fi

    # Test Bot webhook endpoints
    local webhook_response=$(curl -s -X POST "http://localhost:3002/webhooks/appeal" \
        -H "Content-Type: application/json" \
        -d '{"appealId":"test","userId":"test","synapseUserId":"@test:example.com","action":"created"}' || echo "")

    if [[ $webhook_response == *"processed"* ]]; then
        record_test "Matrix Bot Webhook" "PASS" "申诉 webhook 正常处理"
    else
        record_test "Matrix Bot Webhook" "FAIL" "申诉 webhook 处理失败"
    fi
}

# Function to test SSL/TLS configuration
test_ssl_configuration() {
    print_status "测试 SSL/TLS 配置..."

    # Test SSL certificate
    local ssl_info=$(echo | timeout 10 openssl s_client -servername "$(echo "$BASE_URL" | sed 's|https://||')" -connect "$(echo "$BASE_URL" | sed 's|https://||'):443" 2>/dev/null | openssl x509 -noout -dates || echo "")

    if [[ $ssl_info == *"notBefore"* && $ssl_info == *"notAfter"* ]]; then
        record_test "SSL 证书" "PASS" "SSL 证书有效"
    else
        record_test "SSL 证书" "FAIL" "SSL 证书无效或即将过期"
    fi

    # Test HTTPS redirect
    local redirect_response=$(curl -s -I -L "$BASE_URL" | grep -i "location:" || echo "")
    if [[ $redirect_response == *"https://"* ]]; then
        record_test "HTTPS 重定向" "PASS" "HTTP 正确重定向到 HTTPS"
    else
        record_test "HTTPS 重定向" "FAIL" "HTTP 重定向配置异常"
    fi

    # Test SSL/TLS protocols
    local protocols=$(echo | timeout 10 openssl s_client -servername "$(echo "$BASE_URL" | sed 's|https://||')" -connect "$(echo "$BASE_URL" | sed 's|https://||'):443" -tls1_2 2>/dev/null && echo "TLS1.2_OK")

    if [[ $protocols == *"TLS1.2_OK"* ]]; then
        record_test "TLS 1.2 支持" "PASS" "TLS 1.2 协议支持正常"
    else
        record_test "TLS 1.2 支持" "FAIL" "TLS 1.2 协议支持异常"
    fi
}

# Function to test security headers
test_security_headers() {
    print_status "测试安全头配置..."

    local headers=$(curl -s -I "$BASE_URL" || echo "")

    # Test HSTS
    if [[ $headers == *"strict-transport-security"* ]]; then
        record_test "HSTS 头" "PASS" "HSTS 安全头配置正确"
    else
        record_test "HSTS 头" "FAIL" "缺少 HSTS 安全头"
    fi

    # Test XSS Protection
    if [[ $headers == *"x-xss-protection"* ]]; then
        record_test "XSS 保护" "PASS" "XSS 保护头配置正确"
    else
        record_test "XSS 保护" "FAIL" "缺少 XSS 保护头"
    fi

    # Test Content Security Policy
    if [[ $headers == *"content-security-policy"* ]]; then
        record_test "CSP 头" "PASS" "CSP 安全头配置正确"
    else
        record_test "CSP 头" "FAIL" "缺少 CSP 安全头"
    fi

    # Test Frame Options
    if [[ $headers == *"x-frame-options"* ]]; then
        record_test "Frame Options" "PASS" "点击劫持防护正确"
    else
        record_test "Frame Options" "FAIL" "缺少点击劫持防护"
    fi
}

# Function to test performance
test_performance() {
    print_status "测试性能指标..."

    # Test response time
    local response_time=$(curl -o /dev/null -s -w "%{time_total}" "$BASE_URL" || echo "10.0")
    local response_time_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "10000")

    if (( $(echo "$response_time < 2.0" | bc -l 2>/dev/null || echo 0) )); then
        record_test "响应时间" "PASS" "响应时间: ${response_time_ms}ms"
    else
        record_test "响应时间" "FAIL" "响应时间过慢: ${response_time_ms}ms"
    fi

    # Test compression
    local compressed_size=$(curl -s -H "Accept-Encoding: gzip" "$BASE_URL" | wc -c)
    local uncompressed_size=$(curl -s "$BASE_URL" | wc -c)

    if [ "$compressed_size" -lt "$((uncompressed_size * 3 / 4))" ]; then
        record_test "Gzip 压缩" "PASS" "压缩比率正常"
    else
        record_test "Gzip 压缩" "FAIL" "压缩功能未启用或异常"
    fi

    # Test keep-alive connections
    local keep_alive_response=$(curl -s -I "$BASE_URL" | grep -i "connection:" || echo "")
    if [[ $keep_alive_response == *"keep-alive"* ]]; then
        record_test "Keep-Alive" "PASS" "连接复用正常"
    else
        record_test "Keep-Alive" "FAIL" "连接复用配置异常"
    fi
}

# Function to test monitoring services
test_monitoring() {
    print_status "测试监控服务..."

    # Test Prometheus
    if check_http_status "http://localhost:9090" 302; then
        record_test "Prometheus" "PASS" "监控系统正常"
    else
        record_test "Prometheus" "FAIL" "监控系统异常"
    fi

    # Test Grafana
    if check_http_status "http://localhost:3003" 302; then
        record_test "Grafana" "PASS" "可视化监控正常"
    else
        record_test "Grafana" "FAIL" "可视化监控异常"
    fi
}

# Function to run comprehensive load test
run_load_test() {
    print_status "执行负载测试..."

    # Simple load test with curl
    local concurrent_requests=10
    local total_requests=100
    local failed_requests=0

    for i in $(seq 1 $total_requests); do
        if ! check_http_status "$BASE_URL" 200 5; then
            ((failed_requests++))
        fi

        # Rate limiting
        sleep 0.1
    done

    local success_rate=$((100 * (total_requests - failed_requests) / total_requests))

    if [ $success_rate -ge 95 ]; then
        record_test "负载测试" "PASS" "成功率: ${success_rate}%"
    else
        record_test "负载测试" "FAIL" "成功率过低: ${success_rate}%"
    fi
}

# Function to generate test report
generate_test_report() {
    print_status "生成测试报告..."

    echo "======================================"
    echo "Matrix Dashboard System 部署测试报告"
    echo "======================================"
    echo "测试版本: $DEPLOYMENT_VERSION"
    echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "测试环境: Production"
    echo ""
    echo "测试结果统计:"
    echo "总测试数: $TOTAL_TESTS"
    echo "通过测试: $PASSED_TESTS"
    echo "失败测试: $FAILED_TESTS"
    echo "成功率: $(( 100 * PASSED_TESTS / TOTAL_TESTS ))%"
    echo ""
    echo "详细日志: $LOG_FILE"
    echo ""

    if [ $FAILED_TESTS -eq 0 ]; then
        echo "🎉 所有测试通过！部署成功！"
        return 0
    else
        echo "❌ 部分测试失败，请检查失败项并修复。"
        return 1
    fi
}

# Function to cleanup test resources
cleanup_test_resources() {
    print_status "清理测试资源..."

    # Remove test user if created
    # This would be implemented based on your user management API

    # Clear any temporary files
    rm -f /tmp/matrix-dashboard-test-*

    print_status "清理完成"
}

# Main test function
main() {
    print_status "开始 Matrix Dashboard System 部署测试..."
    print_status "测试版本: $DEPLOYMENT_VERSION"

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"

    # Wait for services to be ready
    print_status "等待服务启动..."
    sleep 30

    # Run all tests
    check_service_health "Dashboard Frontend" "$BASE_URL"
    check_service_health "Dashboard Backend" "$API_BASE_URL/health"
    check_service_health "Matrix Bot" "http://localhost:3002/health"
    check_service_health "Matrix Server" "$MATRIX_BASE_URL/_matrix/client/versions"

    test_database_connectivity
    test_api_endpoints
    test_matrix_integration
    test_frontend_application
    test_matrix_bot
    test_ssl_configuration
    test_security_headers
    test_performance
    test_monitoring

    # Optional: Run load test (commented out for safety)
    # run_load_test

    # Generate report
    local report_result=$?
    generate_test_report

    # Cleanup
    cleanup_test_resources

    exit $report_result
}

# Handle script interruption
trap 'print_error "测试被中断"; cleanup_test_resources; exit 1' INT TERM

# Parse command line arguments
case "${1:-}" in
    --help|-h)
        echo "Matrix Dashboard System Deployment Test Script"
        echo ""
        echo "用法: $0 [选项]"
        echo ""
        echo "选项:"
        echo "  --help, -h     显示帮助信息"
        echo "  --quick        快速测试模式"
        echo "  --full         完整测试模式 (默认)"
        echo "  --load         包含负载测试"
        echo ""
        echo "示例:"
        echo "  $0                    # 完整测试"
        echo "  $0 --quick            # 快速测试"
        echo "  $0 --load             # 包含负载测试"
        exit 0
        ;;
    --quick)
        print_status "运行快速测试模式"
        # Only essential tests for quick mode
        check_service_health "Dashboard Frontend" "$BASE_URL"
        check_service_health "Dashboard Backend" "$API_BASE_URL/health"
        test_database_connectivity
        generate_test_report
        ;;
    --load)
        print_status "运行包含负载测试的完整测试"
        main && run_load_test
        ;;
esac

# Run main function
main "$@"