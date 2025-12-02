# Matrix Synapse 内网 + Cloudflare Tunnel 完整部署计划

## 📋 部署总览

本部署计划为您提供了一个完整的 **Matrix Synapse 内网 + Cloudflare Tunnel** 部署方案，具有以下特点：

- ✅ **高安全性**: 所有服务仅绑定本地地址，通过 Cloudflare Tunnel 安全暴露
- ✅ **高性能**: PostgreSQL 数据库 + Redis 缓存 + 优化的 Synapse 配置
- ✅ **完整功能**: 包含 Dashboard 管理、用户控制、审计日志等高级功能
- ✅ **易于维护**: 完整的日志系统、监控配置、自动化脚本
- ✅ **联邦兼容**: 正确的 .well-known 配置确保 Matrix 联邦连接
- ✅ **生产就绪**: 包含安全加固、备份策略、故障排查指南

## 🎯 部署目标

### 核心服务
- **Matrix Synapse Homeserver**: 核心聊天和联邦服务 (端口 8008)
- **Dashboard 后端 API**: 管理界面和用户控制 (端口 3001)
- **PostgreSQL 数据库**: 持久化存储 (端口 5432)
- **Redis 缓存**: 性能优化和会话管理 (端口 6379)

### 网络架构
- **内网部署**: 所有服务仅绑定 `127.0.0.1`
- **Cloudflare Tunnel**: 安全的外网访问入口
- **域名映射**:
  - `matrix.your-domain.com` → Synapse 服务
  - `dashboard.your-domain.com` → Dashboard 管理

### 管理功能
- **用户风险控制**: 四级强制执行（none/silence/soft_ban/hard_ban）
- **审计日志**: 完整的管理操作记录
- **媒体管理**: 去重、保留策略、存储控制
- **申诉系统**: 自动化的申诉处理流程

## 🚀 快速部署指南

### 第一步：环境准备

#### 1.1 系统要求
```bash
# 操作系统
Ubuntu 20.04+ 或 CentOS 8+ 推荐使用 Ubuntu Server

# 最低硬件配置
CPU: 2 核心
内存: 4GB RAM
存储: 50GB SSD (建议 100GB+)

# 推荐配置
CPU: 4+ 核心
内存: 8GB+ RAM
存储: 200GB+ SSD
网络: 稳定的外网连接
```

#### 1.2 安装系统依赖
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y wget curl gnupg2 software-properties-common \
    build-essential python3-dev python3-venv git \
    postgresql postgresql-contrib redis-server

# 检查 Python 版本 (需要 3.8+)
python3 --version

# 安装 Poetry (推荐)
curl -sSL https://install.python-poetry.org | python3 -
```

### 第二步：域名和 Cloudflare 配置

#### 2.1 域名准备
1. **注册域名**: 确保您有一个可用的域名 (如 `your-domain.com`)
2. **Cloudflare 账户**: 注册并登录 Cloudflare 账户
3. **添加站点**: 在 Cloudflare Dashboard 中添加您的域名
4. **DNS 记录**: 确保域名指向 Cloudflare 服务器 (NS 记录已设置)

#### 2.2 安装和配置 Cloudflare Tunnel
```bash
# 运行完整的 Cloudflare Tunnel 设置
sudo /home/shijian/projects/privchat-synapse/scripts/setup_cloudflared.sh all

# 或者分步骤执行
./scripts/setup_cloudflared.sh setup      # 安装 cloudflared
./scripts/setup_cloudflared.sh tunnel     # 创建 tunnel
./scripts/setup_cloudflared.sh dns        # 配置 DNS
sudo ./scripts/setup_cloudflared.sh service # 安装为服务
./scripts/setup_cloudflared.sh test       # 测试连接
```

### 第三步：数据库初始化

#### 3.1 安装和配置 PostgreSQL
```bash
# 运行自动化初始化脚本
sudo /home/shijian/projects/privchat-synapse/scripts/init_postgres.sh

# 脚本会完成以下操作：
# 1. 安装 PostgreSQL 和依赖
# 2. 创建数据库和用户
# 3. 配置连接策略和性能优化
# 4. 创建备份脚本和定时任务
# 5. 导入 Dashboard 数据库模式
```

### 第四步：Synapse 配置和安装

#### 4.1 使用 Poetry 安装 Synapse
```bash
cd /home/shijian/projects/privchat-synapse

# 使用 Poetry 安装依赖
poetry install

# 构建扩展组件
python build_rust.py

# 生成初始配置
poetry run python -m synapse.app.homeserver \
  --server-name matrix.your-domain.com \
  --config-path homeserver.yaml \
  --generate-config
```

#### 4.2 应用生产配置
```bash
# 复制生产配置文件
sudo cp /home/shijian/projects/privchat-synapse/config/homeserver_matrix_production.yaml \
   /etc/matrix-synapse/homeserver.yaml

# 复制日志配置文件
sudo cp /home/shijian/projects/privchat-synapse/config/log_config_production.yaml \
   /etc/matrix-synapse/log_config.yaml

# 编辑配置文件，修改关键参数
sudo nano /etc/matrix-synapse/homeserver.yaml
```

**必须修改的配置项：**
```yaml
# 服务器名称（设置后不可更改）
server_name: "matrix.your-domain.com"

# 公开基础URL
public_baseurl: "https://matrix.your-domain.com"

# 数据库配置
database:
  name: psycopg2
  args:
    user: synapse_user
    password: "your_postgres_password"  # 从 init_postgres.sh 获取
    dbname: synapse
    host: 127.0.0.1
    port: 5432

# 注册配置
registration:
  enable_registration: false  # 关闭公开注册
  registration_shared_secret: "your_registration_secret"  # 生成强密钥

# 签名密钥路径
signing_key_path: "/etc/matrix-synapse/matrix.your-domain.com.signing.key"

# Dashboard 集成
dashboard:
  enabled: true
  default_cache_ttl_seconds: 300
  redis_channel_user_events:
    - "dashboard.user.invalidate"
```

### 第五步：部署 Dashboard

#### 5.1 创建 Dashboard 环境变量
```bash
# 创建环境变量文件
sudo tee /opt/matrix-dashboard/.env > /dev/null << 'EOF'
# 基础配置
NODE_ENV=production
PORT=3001
DASHBOARD_HOST=127.0.0.1
LOG_LEVEL=info

# JWT 配置
JWT_SECRET=your_super_secure_jwt_secret_32_chars_minimum_here
JWT_REFRESH_SECRET=your_refresh_token_secret_also_strong_here
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=604800

# CORS 配置
CORS_ORIGINS=http://localhost:3000,https://dashboard.your-domain.com,https://matrix.your-domain.com

# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=synapse
DB_USER=synapse_user
DB_PASSWORD=your_postgres_password_here
DB_MAX_CONNECTIONS=20

# Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_USER_EVENTS_CHANNEL=dashboard.user.invalidate

# Synapse 集成
SYNAPSE_SERVER_URL=http://127.0.0.1:8008
EOF

# 设置权限
sudo chmod 600 /opt/matrix-dashboard/.env
sudo chown root:root /opt/matrix-dashboard/.env
```

### 第六步：服务启动和验证

#### 6.1 创建和启动服务
```bash
# 创建 Synapse 用户和目录
sudo adduser --system --no-create-home synapse
sudo mkdir -p /var/lib/matrix-synapse/media_store
sudo mkdir -p /var/log/matrix-synapse
sudo chown -R synapse:synapse /var/lib/matrix-synapse
sudo chown -R synapse:synapse /var/log/matrix-synapse

# 启动所有服务
sudo systemctl start postgresql redis
sudo systemctl start cloudflared
sudo systemctl start matrix-synapse
sudo systemctl start matrix-dashboard

# 启用服务开机自启
sudo systemctl enable postgresql redis
sudo systemctl enable cloudflared
sudo systemctl enable matrix-synapse
sudo systemctl enable matrix-dashboard
```

#### 6.2 运行连通性测试
```bash
# 运行完整的测试套件
/home/shijian/projects/privchat-synapse/scripts/test_matrix_connectivity.sh all

# 或运行特定测试
./scripts/test_matrix_connectivity.sh basic       # 基础连接
./scripts/test_matrix_connectivity.sh federation  # 联邦测试
./scripts/test_matrix_connectivity.sh client      # 客户端功能
```

## 🌐 访问地址

根据部署配置，您的服务器可通过以下地址访问：

### 公网访问 (通过 Cloudflare Tunnel)
- **Matrix 服务器**: `https://matrix.your-domain.com`
- **Dashboard 管理界面**: `https://dashboard.your-domain.com`

### 内网访问 (直接连接)
- **Synapse API**: `http://127.0.0.1:8008`
- **Dashboard 后端**: `http://127.0.0.1:3001`
- **PostgreSQL**: `127.0.0.1:5432`
- **Redis**: `127.0.0.1:6379`

## 🔧 配置文件位置

### 核心配置文件
- **Synapse 主配置**: `/etc/matrix-synapse/homeserver.yaml`
- **日志配置**: `/etc/matrix-synapse/log_config.yaml`
- **数据库凭据**: `/tmp/synapse_database_config.yaml`
- **Tunnel 配置**: `~/.cloudflared/config.yml`

### 项目配置文件
- **生产配置模板**: `config/homeserver_matrix_production.yaml`
- **日志配置模板**: `config/log_config_production.yaml`
- **Tunnel 配置模板**: `config/cloudflare_tunnel_matrix.yml`
- **.well-known 配置**: `config/cloudflare_worker_matrix.js`

### 环境变量
- **Dashboard 配置**: `/opt/matrix-dashboard/.env`
- **数据库环境**: `/tmp/synapse_db.env`

## 📊 服务管理命令

### 系统服务管理
```bash
# 查看所有服务状态
sudo systemctl status postgresql redis cloudflared matrix-synapse matrix-dashboard

# 启动服务
sudo systemctl start matrix-synapse
sudo systemctl start matrix-dashboard
sudo systemctl start cloudflared

# 停止服务
sudo systemctl stop matrix-synapse
sudo systemctl stop matrix-dashboard
sudo systemctl stop cloudflared

# 重启服务
sudo systemctl restart matrix-synapse
sudo systemctl restart matrix-dashboard
sudo systemctl restart cloudflared

# 查看日志
sudo journalctl -u matrix-synapse -f
sudo journalctl -u matrix-dashboard -f
sudo journalctl -u cloudflared -f
```

### Cloudflare Tunnel 管理
```bash
# 查看 Tunnel 列表
cloudflared tunnel list

# 查看 Tunnel 日志
sudo journalctl -u cloudflared -f

# 测试 Tunnel 连接
./scripts/setup_cloudflared.sh test

# 重新配置 Tunnel
sudo ./scripts/setup_cloudflared.sh all
```

### 数据库管理
```bash
# 连接到数据库
sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse

# 查看数据库状态
sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse -c "\dt"

# 手动备份
POSTGRES_PASSWORD="your_password" /usr/local/bin/synapse_db_backup.sh

# 查看备份文件
ls -la /var/backups/synapse/
```

## 🧪 测试和验证

### 基础连通性测试
```bash
# 测试 Matrix API
curl -s https://matrix.your-domain.com/_matrix/server/versions | jq

# 测试 Dashboard
curl -I https://dashboard.your-domain.com

# 测试 .well-known 配置
curl -s https://matrix.your-domain.com/.well-known/matrix/server | jq
curl -s https://matrix.your-domain.com/.well-known/matrix/client | jq
```

### 联邦测试
```bash
# 使用 federationtester
curl -s "https://federationtester.matrix.org/api/report?server_name=matrix.your-domain.com" | jq

# 检查服务器密钥
curl -s https://matrix.your-domain.com/_matrix/key/v2/server | jq
```

### 联邦测试网站
- **Federation Tester**: https://federationtester.matrix.org/
- **输入您的域名**: `matrix.your-domain.com`

## 🔒 安全配置要点

### 网络安全
- ✅ 所有服务仅绑定 `127.0.0.1`
- ✅ 通过 Cloudflare Tunnel 进行外网访问
- ✅ 防火墙配置仅允许必要端口
- ✅ 禁用公开注册，启用邀请制

### 身份验证
- ✅ 强密码策略
- ✅ JWT Token 管理
- ✅ 会话安全配置
- ✅ CSRF 保护

### 数据保护
- ✅ 数据库连接加密
- ✅ 敏感信息环境变量存储
- ✅ 定期数据备份
- ✅ 审计日志完整记录

## 📈 监控和维护

### 日志管理
```bash
# 查看 Synapse 日志
tail -f /var/log/matrix-synapse/homeserver.log
tail -f /var/log/matrix-synapse/access.log
tail -f /var/log/matrix-synapse/error.log

# 查看 Dashboard 日志
sudo journalctl -u matrix-dashboard -f

# 查看 Tunnel 日志
sudo journalctl -u cloudflared -f

# 查看数据库日志
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### 系统监控
```bash
# 检查系统资源
htop
df -h
free -h

# 检查服务端口
netstat -tlnp | grep -E ':3001|:5432|:6379|:8008'

# 检查磁盘使用
du -sh /var/lib/matrix-synapse/
du -sh /var/log/matrix-synapse/
```

### 备份管理
```bash
# 手动触发备份
POSTGRES_PASSWORD="your_password" /usr/local/bin/synapse_db_backup.sh

# 检查备份文件
ls -la /var/backups/synapse/

# 验证备份文件
zcat /var/backups/synapse/synapse_backup_latest.sql.gz | head -20
```

## 🆘 故障排查

### 常见问题

1. **服务无法启动**
   ```bash
   # 检查配置语法
   poetry run python -m synapse.app.homeserver --config-path /etc/matrix-synapse/homeserver.yaml --help

   # 检查日志
   sudo journalctl -u matrix-synapse -n 50
   ```

2. **Tunnel 连接失败**
   ```bash
   # 重新配置 Tunnel
   sudo ./scripts/setup_cloudflared.sh all

   # 检查 DNS 解析
   dig matrix.your-domain.com
   ```

3. **联邦连接问题**
   ```bash
   # 测试联邦连接
   curl -s "https://federationtester.matrix.org/api/report?server_name=matrix.your-domain.com" | jq '.FederationOK'
   ```

4. **Dashboard 无法访问**
   ```bash
   # 检查本地连接
   curl -I http://127.0.0.1:3001

   # 检查 Tunnel 路由
   curl -I https://dashboard.your-domain.com
   ```

## 🎉 部署完成

恭喜！您现在拥有了一个完整的、生产就绪的 Matrix Synapse 服务器，具有以下功能：

### 核心功能
- ✅ **Matrix 聊天服务器**: 完整的 Matrix 协议支持
- ✅ **联邦连接**: 与全球 Matrix 网络互联
- ✅ **用户管理**: 通过 Dashboard 进行用户控制
- ✅ **内容审核**: 房间管理和内容控制
- ✅ **媒体管理**: 文件共享和媒体存储

### 管理功能
- ✅ **Dashboard 界面**: `https://dashboard.your-domain.com`
- ✅ **用户风险控制**: 四级强制执行策略
- ✅ **审计日志**: 完整的管理操作记录
- ✅ **性能监控**: 系统状态和性能指标
- ✅ **自动化运维**: 备份、日志轮转、健康检查

### 安全特性
- ✅ **内网部署**: 所有服务仅本地访问
- ✅ **安全隧道**: 通过 Cloudflare Tunnel 安全暴露
- ✅ **数据保护**: 加密存储和传输
- ✅ **访问控制**: 基于角色的权限管理

### 下一步建议

1. **配置用户**: 创建管理员用户和测试用户
2. **设置房间**: 创建公共和私人房间
3. **邀请用户**: 通过邀请码允许用户注册
4. **配置客户端**: 设置 Element 或其他 Matrix 客户端
5. **监控设置**: 配置告警和监控通知

**请保存所有配置文件和密钥，定期进行数据备份，并保持系统和软件的更新。**