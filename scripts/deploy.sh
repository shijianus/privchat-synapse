#!/bin/bash

# Matrix Dashboard System Deployment Script
# Production deployment automation
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
BRANCH_NAME="feature/develop-version-1.0.7"
BACKUP_DIR="/var/backups/matrix-dashboard"
LOG_FILE="/var/log/matrix-dashboard-deploy.log"

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

# Function to check prerequisites
check_prerequisites() {
    print_status "检查部署环境..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装"
        exit 1
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose 未安装"
        exit 1
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装"
        exit 1
    fi

    # Check Git
    if ! command -v git &> /dev/null; then
        print_error "Git 未安装"
        exit 1
    fi

    # Check available disk space (minimum 10GB)
    local available_space=$(df / | tail -1 | awk '{print $4}')
    if [ "$available_space" -lt 10485760 ]; then
        print_warning "磁盘空间可能不足，建议至少 10GB 可用空间"
    fi

    # Check available memory (minimum 4GB)
    local available_memory=$(free -m | awk 'NR==2{print $7}')
    if [ "$available_memory" -lt 4096 ]; then
        print_warning "内存可能不足，建议至少 4GB 可用内存"
    fi

    print_success "环境检查通过"
}

# Function to backup existing data
backup_existing_data() {
    print_status "备份现有数据..."

    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="$BACKUP_DIR/backup_$timestamp"

    mkdir -p "$backup_path"

    # Backup PostgreSQL if exists
    if docker ps --format "table {{.Names}}" | grep -q matrix-postgres; then
        print_status "备份 PostgreSQL 数据..."
        docker exec matrix-postgres pg_dump -U synapse synapse > "$backup_path/postgres_backup.sql"
    fi

    # Backup Redis if exists
    if docker ps --format "table {{.Names}}" | grep -q matrix-redis; then
        print_status "备份 Redis 数据..."
        docker exec matrix-redis redis-cli BGSAVE
        sleep 5
        docker cp matrix-redis:/data/dump.rdb "$backup_path/redis_backup.rdb"
    fi

    # Backup configuration files
    if [ -f ".env.production" ]; then
        cp .env.production "$backup_path/"
    fi

    print_success "数据备份完成: $backup_path"
}

# Function to load environment variables
load_environment() {
    print_status "加载环境变量..."

    if [ ! -f ".env.production" ]; then
        print_error "未找到 .env.production 文件"
        print_status "请复制 .env.example 到 .env.production 并配置相应的环境变量"
        exit 1
    fi

    # Load environment variables
    set -a
    source .env.production
    set +a

    # Verify required environment variables
    required_vars=(
        "POSTGRES_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "SYNAPSE_SERVER_NAME"
        "MATRIX_BOT_USERNAME"
        "MATRIX_BOT_PASSWORD"
        "MATRIX_BOT_HOMESERVER"
        "BOT_ADMIN_ROOM_ID"
    )

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            print_error "缺少必需的环境变量: $var"
            exit 1
        fi
    done

    print_success "环境变量验证通过"
}

# Function to pull latest code
pull_latest_code() {
    print_status "获取最新代码..."

    # Switch to deployment branch
    git checkout "$BRANCH_NAME" || {
        print_error "无法切换到分支: $BRANCH_NAME"
        exit 1
    }

    # Pull latest changes
    git pull origin "$BRANCH_NAME" || {
        print_error "无法拉取最新代码"
        exit 1
    }

    # Get current commit hash
    local commit_hash=$(git rev-parse HEAD)
    print_status "当前部署版本: $commit_hash"

    print_success "代码获取完成"
}

# Function to build and deploy services
deploy_services() {
    print_status "构建和部署服务..."

    # Stop existing services
    print_status "停止现有服务..."
    docker-compose -f docker-compose.production.yml down || true

    # Build new images
    print_status "构建 Docker 镜像..."
    docker-compose -f docker-compose.production.yml build --no-cache

    # Start services
    print_status "启动服务..."
    docker-compose -f docker-compose.production.yml up -d

    # Wait for services to be ready
    print_status "等待服务启动..."
    sleep 30

    print_success "服务部署完成"
}

# Function to run health checks
run_health_checks() {
    print_status "执行健康检查..."

    local services=(
        "matrix-postgres:5432"
        "matrix-redis:6379"
        "dashboard-backend:3001"
        "dashboard-bot:3002"
        "dashboard-frontend:3000"
    )

    for service in "${services[@]}"; do
        local service_name=$(echo "$service" | cut -d':' -f1)
        local service_port=$(echo "$service" | cut -d':' -f2)

        print_status "检查服务: $service_name"

        local max_attempts=30
        local attempt=1

        while [ $attempt -le $max_attempts ]; do
            if docker exec "$service_name" curl -f "http://localhost:$service_port/health" &> /dev/null; then
                print_success "$service_name 健康检查通过"
                break
            fi

            if [ $attempt -eq $max_attempts ]; then
                print_error "$service_name 健康检查失败"
                return 1
            fi

            print_warning "$service_name 未就绪，等待 10 秒... (尝试 $attempt/$max_attempts)"
            sleep 10
            ((attempt++))
        done
    done

    print_success "所有服务健康检查通过"
}

# Function to run database migrations
run_migrations() {
    print_status "运行数据库迁移..."

    # Wait for PostgreSQL to be ready
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker exec matrix-postgres pg_isready -U synapse &> /dev/null; then
            break
        fi

        if [ $attempt -eq $max_attempts ]; then
            print_error "PostgreSQL 未就绪"
            exit 1
        fi

        sleep 2
        ((attempt++))
    done

    # Run migrations
    docker exec dashboard-backend npm run db:migrate || {
        print_error "数据库迁移失败"
        exit 1
    }

    print_success "数据库迁移完成"
}

# Function to verify deployment
verify_deployment() {
    print_status "验证部署..."

    # Check if all containers are running
    local running_containers=$(docker-compose -f docker-compose.production.yml ps -q)
    local expected_containers=$(docker-compose -f docker-compose.production.yml config | grep -c "container_name:")

    if [ $(echo "$running_containers" | wc -l) -ne $expected_containers ]; then
        print_error "部分容器未正常运行"
        docker-compose -f docker-compose.production.yml ps
        exit 1
    fi

    # Test API endpoints
    print_status "测试 API 端点..."

    # Test backend health
    if curl -f "http://localhost:3001/health" &> /dev/null; then
        print_success "Backend API 健康检查通过"
    else
        print_error "Backend API 健康检查失败"
        exit 1
    fi

    # Test frontend
    if curl -f "http://localhost:3000" &> /dev/null; then
        print_success "Frontend 健康检查通过"
    else
        print_error "Frontend 健康检查失败"
        exit 1
    fi

    print_success "部署验证完成"
}

# Function to cleanup old images and containers
cleanup_resources() {
    print_status "清理旧资源..."

    # Remove dangling images
    docker image prune -f

    # Remove unused containers
    docker container prune -f

    # Remove unused volumes (be careful with this)
    # docker volume prune -f

    print_success "资源清理完成"
}

# Function to show deployment summary
show_deployment_summary() {
    print_success "=== 部署完成 ==="
    print_status "部署版本: $DEPLOYMENT_VERSION"
    print_status "部署分支: $BRANCH_NAME"
    print_status "部署时间: $(date)"
    echo ""
    print_status "服务状态:"
    docker-compose -f docker-compose.production.yml ps
    echo ""
    print_status "访问地址:"
    print_status "Dashboard: http://localhost:3000"
    print_status "API: http://localhost:3001"
    print_status "Matrix: http://localhost:8008"
    print_status "Grafana: http://localhost:3003"
    echo ""
    print_status "管理命令:"
    print_status "查看日志: docker-compose -f docker-compose.production.yml logs -f [service]"
    print_status "重启服务: docker-compose -f docker-compose.production.yml restart [service]"
    print_status "停止服务: docker-compose -f docker-compose.production.yml down"
}

# Main deployment function
main() {
    print_status "开始部署 Matrix Dashboard System..."
    print_status "版本: $DEPLOYMENT_VERSION"

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$BACKUP_DIR"

    # Run deployment steps
    check_prerequisites
    backup_existing_data
    load_environment
    pull_latest_code
    deploy_services
    run_health_checks
    run_migrations
    verify_deployment
    cleanup_resources
    show_deployment_summary

    print_success "部署成功完成！"
}

# Handle script interruption
trap 'print_error "部署被中断"; exit 1' INT TERM

# Handle errors
trap 'print_error "部署过程中发生错误，请检查日志: $LOG_FILE"; exit 1' ERR

# Parse command line arguments
case "${1:-}" in
    --help|-h)
        echo "Matrix Dashboard System Deployment Script"
        echo ""
        echo "用法: $0 [选项]"
        echo ""
        echo "选项:"
        echo "  --help, -h     显示帮助信息"
        echo "  --skip-backup  跳过数据备份"
        echo "  --dev          部署开发环境"
        echo ""
        echo "示例:"
        echo "  $0                    # 部署生产环境"
        echo "  $0 --dev             # 部署开发环境"
        echo "  $0 --skip-backup     # 跳过备份"
        exit 0
        ;;
    --skip-backup)
        print_warning "跳过数据备份"
        main() {
            print_status "开始部署 Matrix Dashboard System (跳过备份)..."
            mkdir -p "$(dirname "$LOG_FILE")"
            check_prerequisites
            load_environment
            pull_latest_code
            deploy_services
            run_health_checks
            run_migrations
            verify_deployment
            cleanup_resources
            show_deployment_summary
            print_success "部署成功完成！"
        }
        ;;
    --dev)
        print_warning "部署开发环境"
        BRANCH_NAME="feature/develop-version-1.0.7"
        main() {
            print_status "开始部署 Matrix Dashboard System (开发环境)..."
            mkdir -p "$(dirname "$LOG_FILE")"
            check_prerequisites
            load_environment
            pull_latest_code
            docker-compose -f docker-compose.development.yml down || true
            docker-compose -f docker-compose.development.yml up -d --build
            print_success "开发环境部署完成！"
        }
        ;;
esac

# Run main function
main "$@"