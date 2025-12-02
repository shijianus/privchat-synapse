# 🔧 Matrix Synapse 手动部署步骤

由于需要管理员权限，请按照以下步骤手动执行部署。

## 📋 部署检查清单

### ✅ 系统要求已满足
- ✅ 内存: 7.7GB (要求 4GB+)
- ✅ 磁盘: 98GB 可用 (要求 50GB+)
- ✅ Python: 3.12.3 (要求 3.8+)
- ✅ curl, git, wget 已安装

### 🔄 需要安装的软件包
- ❌ PostgreSQL (需要 sudo)
- ❌ Redis (需要 sudo)
- ❌ Node.js (需要 sudo)
- ❌ Poetry (可能需要 sudo)

## 🚀 手动部署步骤

### 第一步：安装系统依赖

```bash
# 更新包索引
sudo apt update

# 安装 PostgreSQL 和相关包
sudo apt install -y postgresql postgresql-contrib python3-psycopg2

# 安装 Redis
sudo apt install -y redis-server

# 安装 Node.js (用于 Dashboard)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 Poetry (Python 包管理器)
curl -sSL https://install.python-poetry.org | python3 -

# 安装其他必需包
sudo apt install -y build-essential python3-dev jq dnsutils netcat
```

### 第二步：启动基础服务

```bash
# 启动 PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 启动 Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 检查服务状态
sudo systemctl status postgresql
sudo systemctl status redis-server
```

### 第三步：初始化数据库

```bash
# 运行 PostgreSQL 初始化脚本
sudo ./scripts/init_postgres.sh
```

### 第四步：安装 Synapse

```bash
# 进入项目目录
cd /home/shijian/projects/privchat-synapse

# 使用 Poetry 安装依赖
/root/.local/bin/poetry install

# 构建扩展组件
python build_rust.py

# 生成初始配置
/root/.local/bin/poetry run python -m synapse.app.homeserver \
  --server-name matrix.your-domain.com \
  --config-path homeserver.yaml \
  --generate-config
```

### 第五步：配置 Synapse

```bash
# 创建配置目录
sudo mkdir -p /etc/matrix-synapse
sudo mkdir -p /var/lib/matrix-synapse/media_store
sudo mkdir -p /var/log/matrix-synapse

# 复制配置文件
sudo cp config/homeserver_matrix_production.yaml /etc/matrix-synapse/homeserver.yaml
sudo cp config/log_config_production.yaml /etc/matrix-synapse/log_config.yaml

# 创建 Synapse 用户
sudo adduser --system --no-create-home synapse
sudo addgroup synapse
sudo usermod -a -G synapse synapse

# 设置权限
sudo chown -R synapse:synapse /var/lib/matrix-synapse
sudo chown -R synapse:synapse /var/log/matrix-synapse
sudo chown -R synapse:synapse /etc/matrix-synapse
```

### 第六步：编辑配置文件

```bash
# 编辑主配置文件
sudo nano /etc/matrix-synapse/homeserver.yaml
```

**必须修改以下配置项**：
```yaml
# 服务器名称
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
  enable_registration: false
  registration_shared_secret: "your_registration_secret_here"  # 生成强密钥

# Dashboard 集成
dashboard:
  enabled: true
  default_cache_ttl_seconds: 300
```

### 第七步：生成签名密钥

```bash
# 生成签名密钥
sudo -u synapse bash -c "cd /etc/matrix-synapse && /root/.local/bin/poetry run python -m synapse.crypto.keygen --key-type ed25519 --output \"/etc/matrix-synapse/matrix.your-domain.com.signing.key\""

# 设置密钥权限
sudo chmod 600 /etc/matrix-synapse/matrix.your-domain.com.signing.key
sudo chown synapse:synapse /etc/matrix-synapse/matrix.your-domain.com.signing.key
```

### 第八步：创建 systemd 服务

```bash
# 创建 Matrix Synapse 服务文件
sudo tee /etc/systemd/system/matrix-synapse.service > /dev/null << 'EOF'
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
Environment=PYTHONPATH=/home/shijian/projects/privchat-synapse
ExecStart=/root/.local/bin/poetry run python -m synapse.app.homeserver \
    --config-path=/etc/matrix-synapse/homeserver.yaml \
    --config-path=/etc/matrix-synapse/log_config.yaml
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
```

### 第九步：安装和配置 Cloudflare Tunnel

```bash
# 安装 cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# 登录 Cloudflare
cloudflared tunnel login

# 创建 tunnel
cloudflared tunnel create matrix-tunnel

# 保存 tunnel UUID（记下返回的 UUID）
TUNNEL_UUID="your_tunnel_uuid_here"

# 创建配置文件
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_UUID
credentials-file: ~/.cloudflared/$TUNNEL_UUID.json

ingress:
  - hostname: matrix.your-domain.com
    service: http://127.0.0.1:8008
  - hostname: dashboard.your-domain.com
    service: http://127.0.0.1:3001
  - service: http_status:404
EOF

# 配置 DNS 路由
cloudflared tunnel route dns $TUNNEL_UUID matrix.your-domain.com
cloudflared tunnel route dns $TUNNEL_UUID dashboard.your-domain.com

# 安装为系统服务
sudo cloudflared service install
```

### 第十步：配置 Dashboard

```bash
# 创建 Dashboard 目录
sudo mkdir -p /opt/matrix-dashboard

# 复制环境变量文件
sudo cp config/dashboard.env.template /opt/matrix-dashboard/.env

# 编辑环境变量
sudo nano /opt/matrix-dashboard/.env
```

**必须修改的环境变量**：
```bash
# JWT 密钥
JWT_SECRET=your_super_secure_jwt_secret_32_chars_minimum_here

# 数据库密码
DB_PASSWORD=your_postgres_password_here

# CORS 配置
CORS_ORIGINS=https://dashboard.your-domain.com,https://matrix.your-domain.com

# Synapse 集成
SYNAPSE_SERVER_URL=http://127.0.0.1:8008
```

### 第十一步：创建简单的 Dashboard 服务

```bash
# 创建简单的 Dashboard 服务器
sudo tee /opt/matrix-dashboard/server.js > /dev/null << 'EOF'
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// 基础中间件
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'matrix-dashboard' });
});

// 根路径
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

// 启动服务器
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Matrix Dashboard server running on http://127.0.0.1:${PORT}`);
});
EOF

# 安装 Node.js 依赖
cd /opt/matrix-dashboard
sudo npm init -y
sudo npm install express cors

# 创建 systemd 服务
sudo tee /etc/systemd/system/matrix-dashboard.service > /dev/null << 'EOF'
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
```

### 第十二步：启动所有服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动 Matrix Synapse
sudo systemctl start matrix-synapse
sudo systemctl enable matrix-synapse

# 启动 Dashboard
sudo systemctl start matrix-dashboard
sudo systemctl enable matrix-dashboard

# 启动 Cloudflare Tunnel
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# 检查所有服务状态
sudo systemctl status matrix-synapse
sudo systemctl status matrix-dashboard
sudo systemctl status cloudflared
```

### 第十三步：验证部署

```bash
# 运行连通性测试
./scripts/test_matrix_connectivity.sh basic

# 手动测试
curl -I http://127.0.0.1:8008
curl -I http://127.0.0.1:3001
curl -I https://matrix.your-domain.com
curl -I https://dashboard.your-domain.com
```

### 第十四步：创建管理员用户

```bash
# 创建管理员账户
cd /home/shijian/projects/privchat-synapse
/root/.local/bin/poetry run register_new_matrix_user \
    --config /etc/matrix-synapse/homeserver.yaml \
    --user admin \
    --password your_admin_password \
    --admin
```

## 🌐 访问地址

部署成功后，您可以通过以下地址访问：

- **Matrix 服务器**: `https://matrix.your-domain.com`
- **Dashboard 管理界面**: `https://dashboard.your-domain.com`
- **联邦测试**: `https://federationtester.matrix.org/api/report?server_name=matrix.your-domain.com`

## 🔧 服务管理命令

```bash
# 启动服务
sudo systemctl start matrix-synapse matrix-dashboard cloudflared

# 停止服务
sudo systemctl stop matrix-synapse matrix-dashboard cloudflared

# 重启服务
sudo systemctl restart matrix-synapse matrix-dashboard cloudflared

# 查看服务状态
sudo systemctl status matrix-synapse matrix-dashboard cloudflared

# 查看日志
sudo journalctl -u matrix-synapse -f
sudo journalctl -u matrix-dashboard -f
sudo journalctl -u cloudflared -f
```

## ⚠️ 重要提醒

1. **替换域名**: 将 `matrix.your-domain.com` 和 `dashboard.your-domain.com` 替换为您的实际域名
2. **Cloudflare 配置**: 确保您的域名已添加到 Cloudflare 并指向正确的 DNS
3. **防火墙**: 确保防火墙允许必要的端口（HTTP/HTTPS）
4. **安全配置**: 使用强密码和安全的密钥
5. **备份**: 定期备份数据库和配置文件

## 🆘 故障排查

如果遇到问题，请检查：

1. **服务状态**: `sudo systemctl status matrix-synapse`
2. **日志**: `sudo journalctl -u matrix-synapse -n 50`
3. **端口占用**: `netstat -tlnp | grep 8008`
4. **数据库连接**: `sudo -u postgres psql -h 127.0.0.1 -U synapse_user -d synapse`

需要帮助时，请查看详细的部署文档：`MATRIX_DEPLOYMENT_PLAN.md`