# Matrix Synapse 完整部署计划

基于您的变量：
- `DOMAIN=<your-domain.com>` (主域名)
- `SERVER_NAME=<matrix.your-domain.com>` (Matrix服务器域名)
- `INTERNAL_BIND=127.0.0.1:8008` (内部绑定地址)

## 1. 端到端部署计划

### 阶段1：系统准备 (5-10分钟)
- [x] 安装系统依赖和Python环境
- [x] 创建synapse用户和目录
- [x] 安装PostgreSQL数据库
- [x] 安装Redis服务
- [x] 安装Cloudflare Tunnel

### 阶段2：Synapse配置 (10-15分钟)
- [ ] 生成homeserver.yaml配置文件
- [ ] 配置PostgreSQL数据库连接
- [ ] 设置Dashboard集成模块
- [ ] 配置日志系统
- [ ] 创建数据库schema

### 阶段3：网络配置 (10分钟)
- [ ] 配置Cloudflare Tunnel隧道
- [ ] 设置.well-known委托
- [ ] 配置TURN服务器(可选)
- [ ] 验证联邦连接

### 阶段4：Dashboard和Bot (5-10分钟)
- [ ] 配置Dashboard环境变量
- [ ] 启动Dashboard后端服务
- [ ] 配置Matrix Bot服务
- [ ] 验证集成功能

### 阶段5：安全加固和监控 (5分钟)
- [ ] 配置防火墙规则
- [ ] 设置监控指标
- [ ] 配置备份策略
- [ ] 验证安全配置

**预计总时间：35-50分钟**

## 2. Homeserver.yaml 差异化配置建议

基于 `docs/usage/configuration/homeserver_sample_config.md` 和 `docs/sample_config.yaml`：

```yaml
# 需要修改的关键配置项
server_name: "matrix.your-domain.com"  # ⚠️ 修改后不能更改
public_baseurl: "https://matrix.your-domain.com"  # 客户端连接URL

listeners:
  - port: 8008
    type: http
    x_forwarded: true  # 重要：启用代理头部支持
    bind_addresses: ['127.0.0.1']  # 仅本地绑定，通过Cloudflare暴露

database:
  name: psycopg2  # 从SQLite切换到PostgreSQL
  args:
    user: synapse_user
    password: your_secure_password
    dbname: synapse
    host: 127.0.0.1
    cp_min: 5
    cp_max: 10
    keepalives_idle: 10
    keepalives_interval: 10
    keepalives_count: 3

media_store_path: "/var/lib/matrix-synapse/media"  # 媒体文件存储

registration:
  enable_registration: false  # 关闭公开注册
  registration_shared_secret: "your_registration_secret"

# Dashboard集成配置
dashboard:
  enabled: true
  redis_channel_user_events:
    - "dashboard.user.invalidate"
    - "dashboard.user.force_disconnect"
  default_cache_ttl_seconds: 300

# TURN服务器配置(可选)
turn_uris:
  - "turn:matrix.your-domain.com:3478?transport=udp"
  - "turn:matrix.your-domain.com:3478?transport=tcp"
turn_shared_secret: "your_turn_secret"
turn_user_lifetime: 86400000
turn_allow_guests: true
```

**修改理由**：
- `server_name`: 确定用户ID格式，一旦设置不可更改
- `public_baseurl`: 客户端自动发现服务地址
- `x_forwarded`: 正确获取客户端真实IP
- `bind_addresses`: 安全考虑，仅本地监听
- `database`: PostgreSQL提供更好的性能和并发支持
- `enable_registration`: 安全考虑，关闭公开注册

## 3. PostgreSQL初始化脚本

基于 `docs/postgres.md` 为Ubuntu系统：

```bash
#!/bin/bash
# PostgreSQL初始化脚本 - Ubuntu系统
# 使用方法: sudo bash init_postgres.sh

set -e

echo "=== Matrix Synapse PostgreSQL 初始化 ==="

# 1. 安装PostgreSQL
echo "安装PostgreSQL..."
apt update
apt install -y postgresql postgresql-contrib

# 2. 启动并启用PostgreSQL
echo "启动PostgreSQL服务..."
systemctl start postgresql
systemctl enable postgresql

# 3. 创建synapse用户和数据库
echo "创建Synapse数据库用户和数据库..."
sudo -u postgres psql << 'EOSQL'
CREATE USER synapse_user WITH PASSWORD 'your_secure_password_here';
CREATE DATABASE synapse
    WITH ENCODING='UTF8'
    LC_COLLATE='C'
    LC_CTYPE='C'
    TEMPLATE=template0
    OWNER=synapse_user;
GRANT ALL PRIVILEGES ON DATABASE synapse TO synapse_user;
EOSQL

# 4. 配置本地连接策略
echo "配置PostgreSQL本地连接..."
cat >> /etc/postgresql/*/main/pg_hba.conf << 'EOCONFIG'

# Matrix Synapse本地连接配置
local   synapse    synapse_user                     md5
host    synapse    synapse_user    127.0.0.1/32   md5
host    synapse    synapse_user    ::1/128         md5
EOCONFIG

# 5. 重启PostgreSQL应用配置
echo "重启PostgreSQL应用配置..."
systemctl restart postgresql

# 6. 验证连接
echo "验证数据库连接..."
sudo -u postgres psql -c "SELECT datname FROM pg_database WHERE datname='synapse';"
sudo -u synapse_user psql -d synapse -c "SELECT current_user, current_database();"

# 7. 优化的PostgreSQL配置（适合Matrix Synapse）
echo "配置PostgreSQL性能参数..."
cat >> /etc/postgresql/*/main/postgresql.conf << 'EOPERF'

# Matrix Synapse性能优化配置
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
autovacuum_work_mem = -1
max_connections = 200
EOPERF

echo "=== PostgreSQL初始化完成 ==="
echo "数据库: synapse"
echo "用户: synapse_user"
echo "请在homeserver.yaml中使用这些连接参数"
```

## 4. 生产日志配置建议

基于 `docs/sample_log_config.yaml` 和 `docs/usage/configuration/logging_sample_config.md`：

**日志配置文件** `/etc/matrix-synapse/log_config.yaml`：

```yaml
version: 1
formatters:
  precise:
    format: '%(asctime)s - %(name)s - %(lineno)d - %(levelname)s - %(request)s - %(message)s'
    datefmt: '%Y-%m-%d %H:%M:%S'
  journal:
    format: '%(name)s: [%(request)s] %(message)s'
handlers:
  file:
    class: logging.handlers.RotatingFileHandler
    formatter: precise
    filename: /var/log/matrix-synapse/homeserver.log
    maxBytes: 104857600  # 100MB
    backupCount: 10
    encoding: utf8
  console:
    class: logging.StreamHandler
    formatter: precise
loggers:
  synapse:
    level: INFO
    handlers: [file, console]
    propagate: false
  synapse.access:
    level: INFO
    handlers: [file]
    propagate: false
  synapse.storage.SQL:
    level: WARNING  # 减少SQL日志噪音
  twisted:
    level: INFO
    handlers: [file]
    propagate: false
root:
  level: INFO
  handlers: [file, console]
```

**权限和路径设置**：

```bash
# 创建日志目录
mkdir -p /var/log/matrix-synapse
chown synapse:adm /var/log/matrix-synapse
chmod 750 /var/log/matrix-synapse

# 配置日志轮转
cat > /etc/logrotate.d/matrix-synapse << 'EOF'
/var/log/matrix-synapse/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 synapse adm
    postrotate
        systemctl reload matrix-synapse || true
    endscript
}
EOF
```

## 5. .well-known配置方案

基于 `docs/reverse_proxy.md` 和 `docs/delegate.md`：

### 方案A：Cloudflare Workers返回 (推荐)

**优点**：
- 性能好，全球CDN分发
- 不需要额外的Web服务器
- 自动HTTPS证书
- 配置简单

**缺点**：
- 依赖Cloudflare服务
- 免费版有调用限制

**实现**：

```javascript
// Cloudflare Worker脚本
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)

  if (url.pathname === '/.well-known/matrix/server') {
    return new Response(JSON.stringify({
      "m.server": "matrix.your-domain.com:443"
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  if (url.pathname === '/.well-known/matrix/client') {
    return new Response(JSON.stringify({
      "m.homeserver": {
        "base_url": "https://matrix.your-domain.com"
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  return new Response('Not Found', { status: 404 })
}
```

### 方案B：Nginx本地返回

**优点**：
- 完全控制
- 无外部依赖
- 无调用限制

**缺点**：
- 需要配置和维护Web服务器
- 需要SSL证书管理

**实现**：

```nginx
# Nginx配置片段
location /.well-known/matrix/server {
    return 200 '{"m.server": "matrix.your-domain.com:443"}';
    default_type application/json;
    add_header Access-Control-Allow-Origin *;
}

location /.well-known/matrix/client {
    return 200 '{"m.homeserver": {"base_url": "https://matrix.your-domain.com"}}';
    default_type application/json;
    add_header Access-Control-Allow-Origin *;
}
```

**推荐方案**：对于您的内网+Tunnel环境，推荐使用Cloudflare Workers方案，因为：
1. 您已经使用Cloudflare Tunnel
2. 无需额外配置Web服务器
3. 自动处理HTTPS证书
4. 全球分发性能好

## 6. Cloudflare Tunnel配置

基于 `docs/INTRANET_CLOUDFLARE_TUNNEL.md` 的操作清单：

### 安装cloudflared
```bash
# Ubuntu/Debian
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### 登录和认证
```bash
# 登录Cloudflare账户
cloudflared tunnel login

# 创建tunnel（生成UUID）
cloudflared tunnel create matrix-tunnel

# 记录返回的UUID: tunnel-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 配置文件模板
**文件位置**：`~/.cloudflared/config.yml`

```yaml
tunnel: your-tunnel-uuid-here  # 替换为实际UUID
credentials-file: /home/youruser/.cloudflared/your-tunnel-uuid.json

ingress:
  # Matrix服务器主隧道
  - hostname: matrix.your-domain.com
    service: http://127.0.0.1:8008

  # Dashboard管理界面隧道
  - hostname: dashboard.your-domain.com
    service: http://127.0.0.1:3001

  # 可选：TURN服务器STUN端口
  - hostname: turn.your-domain.com
    service: udp://127.0.0.1:3478

  # 默认规则：拒绝其他请求
  - service: http_status:404
```

### DNS路由配置
```bash
# 为tunnel配置DNS记录
cloudflared tunnel route dns matrix-tunnel matrix.your-domain.com
cloudflared tunnel route dns matrix-tunnel dashboard.your-domain.com
cloudflared tunnel route dns matrix-tunnel turn.your-domain.com
```

### 安装为系统服务
```bash
# 创建配置目录
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/
sudo cp ~/.cloudflared/your-tunnel-uuid.json /etc/cloudflared/

# 设置权限
sudo chown -R root:cloudflared /etc/cloudflared/
sudo chmod 600 /etc/cloudflared/your-tunnel-uuid.json

# 安装系统服务
sudo cloudflared service install

# 启动服务
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# 检查状态
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

### 验证tunnel连接
```bash
# 检查tunnel健康状态
cloudflared tunnel info matrix-tunnel

# 测试本地服务连接
curl -I http://127.0.0.1:8008/health

# 测试tunnel连接
curl -I https://matrix.your-domain.com/health
```

## 7. 联邦与客户端自检清单

基于 `docs/federate.md`：

### 联邦测试命令
```bash
# 1. 检查本地服务状态
curl -s http://127.0.0.1:8008/_matrix/client/versions

# 2. 检查服务器密钥
curl -s https://matrix.your-domain.com/_matrix/key/v2/server

# 3. 测试联邦发现
curl -s https://matrix.your-domain.com/.well-known/matrix/server

# 4. 测试客户端发现
curl -s https://matrix.your-domain.com/.well-known/matrix/client

# 5. 验证联邦连接
curl -X POST -H "Content-Type: application/json" \
  -d '{"method":"GET","uri":"_matrix/federation/v1/version","origin":"matrix.org","destination":"matrix.your-domain.com"}' \
  https://matrix.your-domain.com/_matrix/federation/v1/version

# 6. 使用federationtester验证
# 访问: https://federationtester.matrix.org/api/report?server_name=matrix.your-domain.com
```

### 常见错误定位

**Synapse日志检查**：
```bash
# 查看Synapse主日志
sudo journalctl -u matrix-synapse -f

# 查看联邦相关日志
sudo journalctl -u matrix-synapse | grep -i federation

# 查看错误日志
sudo journalctl -u matrix-synapse --priority=err
```

**Cloudflared日志检查**：
```bash
# 查看cloudflared服务日志
sudo journalctl -u cloudflared -f

# 查看连接错误
sudo journalctl -u cloudflared | grep -i error

# 查看请求处理
sudo journalctl -u cloudflared | grep -i "http\|request"
```

**常见联邦错误**：
1. **401 Unauthorized**: 检查服务器签名密钥
2. **403 Forbidden**: 检查防火墙和网络配置
3. **404 Not Found**: 检查.well-known配置
4. **Connection timeout**: 检查cloudflared连接状态

**验证清单**：
- [ ] Matrix服务器响应健康检查
- [ ] .well-known/server正确配置
- [ ] .well-known/client正确配置
- [ ] 联邦端口正确路由(8448或通过tunnel)
- [ ] 服务器密钥可获取
- [ ] federationtester测试通过
- [ ] 可以发送和接收联邦消息

## 8. Dashboard集成配置

基于 `docs/DASHBOARD_INTEGRATION.md` 和 `docs/sample_dashboard.env`：

### Dashboard后端环境变量
**文件位置**：`/opt/matrix-dashboard/.env`

```bash
# 基本配置
NODE_ENV=production
PORT=3001
DASHBOARD_HOST=127.0.0.1
LOG_LEVEL=info

# CORS配置（允许您的域名）
CORS_ORIGINS=https://dashboard.your-domain.com,https://matrix.your-domain.com

# JWT密钥（请修改为强密码）
JWT_SECRET=your_super_secure_jwt_secret_32_chars_minimum
JWT_REFRESH_SECRET=your_refresh_token_secret_also_strong

# Token生命周期
JWT_ACCESS_TTL_SECONDS=900      # 15分钟
JWT_REFRESH_TTL_SECONDS=604800   # 7天

# 缓存配置
DASHBOARD_CACHE_TTL_SECONDS=300

# Redis连接（与Synapse共享）
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_USER_EVENTS_CHANNEL=dashboard.user.invalidate

# PostgreSQL连接（与Synapse共享）
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=synapse
DB_USER=synapse_user
DB_PASSWORD=your_secure_password
DB_MAX_CONNECTIONS=20

# Bot API集成
BOT_API_SECRET=your_bot_shared_secret_strong
```

### Matrix Bot配置
**文件位置**：`/opt/matrix-bot/.env`

```bash
# Bot服务配置
BOT_PORT=3002
BOT_HOST=127.0.0.1

# Matrix Bot账户配置
MATRIX_HOMESERVER_URL=http://127.0.0.1:8008
MATRIX_BOT_USER=@adminbot:matrix.your-domain.com
MATRIX_BOT_PASSWORD=secure_bot_password_here

# Dashboard API位置
DASHBOARD_API_BASE_URL=http://127.0.0.1:3001
BOT_SHARED_SECRET=your_bot_shared_secret_strong
```

### Cloudflared Dashboard Ingress配置

在 `~/.cloudflared/config.yml` 中添加：

```yaml
ingress:
  # 现有的Matrix服务...
  - hostname: matrix.your-domain.com
    service: http://127.0.0.1:8008

  # Dashboard管理界面
  - hostname: dashboard.your-domain.com
    service: http://127.0.0.1:3001

  # 其他配置...
```

然后运行：
```bash
# 添加DNS记录
cloudflared tunnel route dns matrix-tunnel dashboard.your-domain.com

# 重启cloudflared服务
sudo systemctl restart cloudflared
```

### Dashboard内部访问地址

**内网直接访问**：
- Dashboard后端API: `http://127.0.0.1:3001`
- Matrix Bot服务: `http://127.0.0.1:3002`
- Synapse服务器: `http://127.0.0.1:8008`

**公网访问**（通过Cloudflare Tunnel）：
- Dashboard管理界面: `https://dashboard.your-domain.com`
- Matrix客户端: `https://matrix.your-domain.com`

## 9. TURN服务器配置

基于 `docs/setup/turn/coturn.md` 和 `docs/turn-howto.md`：

### 内网+Tunnel场景评估

**可行性**：中等难度
- TURN需要公网IP才能正常工作
- 内网部署需要端口映射
- Cloudflare Tunnel不直接支持UDP流量

**推荐方案**：使用公网VPS部署TURN服务器

### coturn部署步骤

**1. 安装coturn**
```bash
sudo apt update
sudo apt install -y coturn
```

**2. 配置coturn**
编辑 `/etc/turnserver.conf`：

```conf
# 基本配置
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0

# 认证配置
use-auth-secret
static-auth-secret=your_turn_shared_secret_here
realm=matrix.your-domain.com

# 网络配置
total-quota=100
user-quota=12
max-bps=64000

# 安全配置
no-loopback-peers
no-multicast-peers

# 日志配置
log-file=/var/log/turnserver.log
verbose
```

**3. 启用coturn服务**
```bash
# 编辑服务配置
sudo nano /etc/default/coturn
# 取消注释: TURNSERVER_ENABLED=1

# 启动服务
sudo systemctl enable coturn
sudo systemctl start coturn
sudo systemctl status coturn
```

### Synapse/客户端配置

**在homeserver.yaml中添加**：
```yaml
turn_uris:
  - "turn:your-turn-server.com:3478?transport=udp"
  - "turn:your-turn-server.com:3478?transport=tcp"
  - "turns:your-turn-server.com:5349?transport=tcp"
turn_shared_secret: "your_turn_shared_secret_here"
turn_user_lifetime: 86400000  # 24小时
turn_allow_guests: true
```

### 连通性测试命令

```bash
# 1. 测试TURN服务器响应
turnutils_uclient -T -u testuser -w testpass your-turn-server.com

# 2. 测试UDP连接
nc -u -v your-turn-server.com 3478

# 3. 测试TLS连接
openssl s_client -connect your-turn-server.com:5349

# 4. 检查coturn状态
sudo systemctl status coturn
sudo journalctl -u coturn -f
```

## 10. Worker拆分评估

基于 `docs/workers.md` 和您的并发规模：

### 当前并发评估
- **小规模部署** (< 100用户): 不需要拆分workers
- **中等规模** (100-1000用户): 可考虑基础worker拆分
- **大规模部署** (> 1000用户): 推荐完整worker架构

### 推荐的Worker拆分拓扑

**阶段1：基础拆分（100-500用户）**
```
Main Process (主进程)
├── Federation Worker (联邦通信)
├── Client API Worker (客户端API)
├── Media Repository Worker (媒体处理)
└── Sync Worker (同步流)
```

**阶段2：完整拆分（500+用户）**
```
Main Process (主进程)
├── Federation Worker (联邦)
├── Client API Workers (多个实例)
├── Media Repository Workers (多个实例)
├── Sync Workers (多个实例)
├── Presence Worker (在线状态)
├── Events Persister Worker (事件持久化)
└── Background Workers (后台任务)
```

### 系统服务编排示例

**systemd服务文件示例** (`/etc/systemd/system/matrix-synapse@.service`):

```ini
[Unit]
Description=Matrix Synapse %i Worker
After=network.target postgresql.service redis.service
Requires=postgresql.service redis.service

[Service]
Type=notify
User=synapse
Group=synapse
WorkingDirectory=/var/lib/matrix-synapse
ExecStart=/opt/synapse/env/bin/python -m synapse.app.homeserver \
    --config-path=/etc/matrix-synapse/homeserver.yaml \
    --config-path=/etc/matrix-synapse/workers/%i.yaml
Restart=always
RestartSec=3
SyslogIdentifier=matrix-synapse-%i

[Install]
WantedBy=multi-user.target
```

### 健康检查要点

**主进程健康检查**：
```bash
# HTTP健康检查
curl -f http://127.0.0.1:8008/health || exit 1

# 进程状态检查
systemctl is-active matrix-synapse-main || exit 1
```

**Worker健康检查**：
```bash
# 检查所有worker状态
systemctl list-units matrix-synapse@* --no-legend

# 检查worker响应时间
curl -w "@curl-format.txt" -o /dev/null -s \
    http://127.0.0.1:8080/_matrix/client/versions
```

**Redis连接检查**：
```bash
# 测试Redis连接
redis-cli -u redis://127.0.0.1:6379 ping

# 监控Redis集群状态
redis-cli info replication
```

**建议**：对于您的初始部署，建议先使用单进程模式，监控性能指标后根据实际负载决定是否需要worker拆分。

---

## 下一步行动

请提供您的具体域名信息，我将为您生成定制化的配置文件和部署脚本。
```