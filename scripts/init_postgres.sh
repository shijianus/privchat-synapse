#!/bin/bash

# Matrix Synapse PostgreSQL 初始化脚本
# 适用于 Ubuntu Server 内网 + Cloudflare Tunnel 部署

# 错误处理
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

# 检查是否以 root 权限运行
if [[ $EUID -ne 0 ]]; then
    log_error "此脚本需要 root 权限运行"
    exit 1
fi

# 配置变量（请根据实际情况修改）
DB_NAME="synapse"
DB_USER="synapse_user"
DB_PASSWORD=""  # 将在后续步骤中设置
DB_HOST="127.0.0.1"
DB_PORT="5432"
POSTGRES_VERSION="15"
DATA_DIR="/var/lib/postgresql/${POSTGRES_VERSION}/main"

log_step "开始 PostgreSQL 初始化流程..."

# 1. 更新系统包
log_step "1. 更新系统包..."
apt update && apt upgrade -y

# 2. 安装 PostgreSQL 和依赖
log_step "2. 安装 PostgreSQL 和依赖..."
apt install -y postgresql postgresql-contrib postgresql-client-common postgresql-common python3-psycopg2 build-essential

# 3. 生成安全密码
if [[ -z "$DB_PASSWORD" ]]; then
    log_step "3. 生成数据库安全密码..."
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    log_info "生成的数据库密码: $DB_PASSWORD"
    log_warn "请妥善保存此密码，稍后将写入配置文件"
fi

# 4. 启动并启用 PostgreSQL 服务
log_step "4. 启动并配置 PostgreSQL 服务..."
systemctl start postgresql
systemctl enable postgresql

# 5. 创建数据库和用户
log_step "5. 创建 Synapse 数据库和用户..."

# 使用 sudo -u postgres 执行 SQL 命令
sudo -u postgres psql << "EOSQL"
-- 创建数据库用户
CREATE USER synapse_user WITH PASSWORD '${DB_PASSWORD}';

-- 创建数据库
CREATE DATABASE synapse
    WITH ENCODING='UTF8'
    LC_COLLATE='C'
    LC_CTYPE='C'
    TEMPLATE=template0
    OWNER=synapse_user;

-- 授予权限
GRANT ALL PRIVILEGES ON DATABASE synapse TO synapse_user;

-- 连接到 synapse 数据库并创建必要的扩展
\c synapse
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 显示创建的数据库信息
\l synapse
\du synapse_user
EOSQL

# 6. 配置 PostgreSQL 连接策略
log_step "6. 配置 PostgreSQL 连接策略..."

# 备份原始配置文件
cp /etc/postgresql/${POSTGRES_VERSION}/main/pg_hba.conf /etc/postgresql/${POSTGRES_VERSION}/main/pg_hba.conf.backup

# 配置 pg_hba.conf
cat >> /etc/postgresql/${POSTGRES_VERSION}/main/pg_hba.conf << 'EOF'

# Matrix Synapse 配置 - 仅允许本地连接
local   synapse    synapse_user                     md5
host    synapse    synapse_user    127.0.0.1/32   md5
host    synapse    synapse_user    ::1/128         md5
EOF

# 7. 优化 PostgreSQL 配置
log_step "7. 优化 PostgreSQL 配置..."

# 备份 postgresql.conf
cp /etc/postgresql/${POSTGRES_VERSION}/main/postgresql.conf /etc/postgresql/${POSTGRES_VERSION}/main/postgresql.conf.backup

# 获取系统内存信息
TOTAL_MEMORY_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEMORY_MB=$((TOTAL_MEMORY_KB / 1024))
TOTAL_MEMORY_GB=$((TOTAL_MEMORY_MB / 1024))

# 根据系统内存计算最佳配置
if [ $TOTAL_MEMORY_GB -lt 2 ]; then
    SHARED_BUFFERS="64MB"
    EFFECTIVE_CACHE_SIZE="512MB"
    WORK_MEM="1MB"
    MAINTENANCE_WORK_MEM="16MB"
elif [ $TOTAL_MEMORY_GB -lt 4 ]; then
    SHARED_BUFFERS="128MB"
    EFFECTIVE_CACHE_SIZE="1GB"
    WORK_MEM="2MB"
    MAINTENANCE_WORK_MEM="32MB"
elif [ $TOTAL_MEMORY_GB -lt 8 ]; then
    SHARED_BUFFERS="256MB"
    EFFECTIVE_CACHE_SIZE="2GB"
    WORK_MEM="4MB"
    MAINTENANCE_WORK_MEM="64MB"
else
    SHARED_BUFFERS="512MB"
    EFFECTIVE_CACHE_SIZE="4GB"
    WORK_MEM="8MB"
    MAINTENANCE_WORK_MEM="128MB"
fi

# 更新 postgresql.conf
cat >> /etc/postgresql/${POSTGRES_VERSION}/main/postgresql.conf << EOF

# Matrix Synapse 性能优化配置
# 基于系统总内存: ${TOTAL_MEMORY_MB}MB

# 内存配置
shared_buffers = ${SHARED_BUFFERS}
effective_cache_size = ${EFFECTIVE_CACHE_SIZE}
work_mem = ${WORK_MEM}
maintenance_work_mem = ${MAINTENANCE_WORK_MEM}
autovacuum_work_mem = -1

# 连接配置
max_connections = 200
superuser_reserved_connections = 3

# 检查点配置
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# 日志配置
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_statement = 'none'
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# 性能配置
random_page_cost = 1.1
effective_io_concurrency = 200
EOF

# 8. 重启 PostgreSQL 服务
log_step "8. 重启 PostgreSQL 服务..."
systemctl restart postgresql

# 9. 验证安装
log_step "9. 验证 PostgreSQL 安装..."

# 检查服务状态
if systemctl is-active --quiet postgresql; then
    log_info "✓ PostgreSQL 服务运行正常"
else
    log_error "✗ PostgreSQL 服务未运行"
    exit 1
fi

# 测试数据库连接
if sudo -u postgres psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null 2>&1; then
    log_info "✓ 数据库连接测试成功"
else
    log_error "✗ 数据库连接测试失败"
    exit 1
fi

# 10. 创建 Dashboard 模式和表结构
log_step "10. 创建 Dashboard 模式和表结构..."

# 检查是否存在 Dashboard 模式文件
DASHBOARD_SCHEMA_FILE="dashboard/schema/dashboard_schema.sql"
if [[ -f "$DASHBOARD_SCHEMA_FILE" ]]; then
    log_info "找到 Dashboard 模式文件，正在导入..."
    sudo -u postgres psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < "$DASHBOARD_SCHEMA_FILE"
    log_info "✓ Dashboard 模式导入完成"
else
    log_warn "未找到 Dashboard 模式文件: $DASHBOARD_SCHEMA_FILE"
    log_warn "您需要稍后手动创建 Dashboard 模式"
fi

# 11. 创建连接信息文件
log_step "11. 生成连接信息文件..."

# 创建 Synapse 数据库配置片段
cat > /tmp/synapse_database_config.yaml << EOF
# Synapse 数据库配置
# 将此内容添加到 homeserver.yaml 文件中

database:
  name: psycopg2
  args:
    user: ${DB_USER}
    password: ${DB_PASSWORD}
    dbname: ${DB_NAME}
    host: ${DB_HOST}
    port: ${DB_PORT}
    cp_min: 5
    cp_max: 10
    keepalives_idle: 10
    keepalives_interval: 10
    keepalives_count: 3
    query_timeout: 30  # 30 seconds timeout
    options: "-c default_transaction_isolation=read_committed -c synchronous_commit=off"
EOF

# 创建环境变量文件
cat > /tmp/synapse_db.env << EOF
# Synapse 数据库环境变量
POSTGRES_DB=${DB_NAME}
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_HOST=${DB_HOST}
POSTGRES_PORT=${DB_PORT}
POSTGRES_CONNECTION_POOL_MIN=5
POSTGRES_CONNECTION_POOL_MAX=10
EOF

# 设置文件权限
chmod 600 /tmp/synapse_database_config.yaml
chmod 600 /tmp/synapse_db.env
chown root:root /tmp/synapse_database_config.yaml
chown root:root /tmp/synapse_db.env

# 12. 创建备份脚本
log_step "12. 创建数据库备份脚本..."

cat > /usr/local/bin/synapse_db_backup.sh << 'EOF'
#!/bin/bash

# Matrix Synapse 数据库备份脚本

BACKUP_DIR="/var/backups/synapse"
DB_NAME="synapse"
DB_USER="synapse_user"
DB_HOST="127.0.0.1"
DB_PORT="5432"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/synapse_backup_${TIMESTAMP}.sql"
RETENTION_DAYS=30

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 执行备份
echo "开始备份数据库..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --verbose \
    --clean \
    --if-exists \
    --no-password \
    > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "备份完成: $BACKUP_FILE"

    # 压缩备份文件
    gzip "$BACKUP_FILE"
    echo "备份已压缩: ${BACKUP_FILE}.gz"

    # 删除过期备份
    find "$BACKUP_DIR" -name "synapse_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    echo "已删除 $RETENTION_DAYS 天前的旧备份"
else
    echo "备份失败!"
    rm -f "$BACKUP_FILE"
    exit 1
fi
EOF

chmod +x /usr/local/bin/synapse_db_backup.sh

# 13. 创建定时备份任务
log_step "13. 创建定时备份任务..."

# 添加到 crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/synapse_db_backup.sh") | crontab -

# 14. 显示完成信息
log_step "安装完成！"

echo
echo "=================================="
echo "PostgreSQL 配置完成"
echo "=================================="
echo
echo "数据库连接信息:"
echo "  主机: $DB_HOST"
echo "  端口: $DB_PORT"
echo "  数据库: $DB_NAME"
echo "  用户: $DB_USER"
echo "  密码: $DB_PASSWORD"
echo
echo "配置文件位置:"
echo "  PostgreSQL 主配置: /etc/postgresql/${POSTGRES_VERSION}/main/postgresql.conf"
echo "  认证配置: /etc/postgresql/${POSTGRES_VERSION}/main/pg_hba.conf"
echo "  Synapse 数据库配置: /tmp/synapse_database_config.yaml"
echo "  环境变量文件: /tmp/synapse_db.env"
echo
echo "备份脚本:"
echo "  备份脚本位置: /usr/local/bin/synapse_db_backup.sh"
echo "  备份目录: /var/backups/synapse"
echo "  定时备份: 每天凌晨 2:00"
echo
echo "下一步操作:"
echo "1. 请将 /tmp/synapse_database_config.yaml 的内容添加到 homeserver.yaml"
echo "2. 设置 POSTGRES_PASSWORD 环境变量以支持备份脚本"
echo "3. 运行 'systemctl status postgresql' 确认服务状态"
echo "4. 运行备份脚本测试: 'POSTGRES_PASSWORD=\"$DB_PASSWORD\" /usr/local/bin/synapse_db_backup.sh'"
echo

log_info "PostgreSQL 初始化完成！"
log_warn "请保存数据库密码: $DB_PASSWORD"