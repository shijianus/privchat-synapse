#!/bin/bash

# Matrix Synapse 快速部署命令生成器
# 为管理员提供可复制粘贴的部署命令

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 配置变量
MATRIX_DOMAIN="matrix.your-domain.com"
DASHBOARD_DOMAIN="dashboard.your-domain.com"
SERVER_NAME="matrix.your-domain.com"

# 生成随机密码和密钥
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

generate_secret() {
    openssl rand -hex 64
}

# 显示横幅
echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║               🚀 Matrix Synapse 快速部署命令生成器              ║${NC}"
echo -e "${BOLD}${BLUE}║                   内网 + Cloudflare Tunnel 方案                   ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo

# 生成密码和密钥
POSTGRES_PASSWORD=$(generate_password)
JWT_SECRET=$(generate_secret)
REGISTRATION_SECRET=$(generate_secret)
ADMIN_PASSWORD=$(generate_password)

echo -e "${BOLD}${YELLOW}📋 生成配置信息${NC}"
echo -e "Matrix 域名: ${GREEN}$MATRIX_DOMAIN${NC}"
echo -e "Dashboard 域名: ${GREEN}$DASHBOARD_DOMAIN${NC}"
echo -e "PostgreSQL 密码: ${GREEN}$POSTGRES_PASSWORD${NC}"
echo -e "JWT 密钥: ${GREEN}$JWT_SECRET${NC}"
echo -e "注册共享密钥: ${GREEN}$REGISTRATION_SECRET${NC}"
echo -e "管理员密码: ${GREEN}$ADMIN_PASSWORD${NC}"
echo

echo -e "${BOLD}${YELLOW}🔧 第一步：安装系统依赖${NC}"
echo "```bash"
echo "# 更新包索引"
echo "sudo apt update"
echo
echo "# 安装 PostgreSQL"
echo "sudo apt install -y postgresql postgresql-contrib python3-psycopg2"
echo
echo "# 安装 Redis"
echo "sudo apt install -y redis-server"
echo
echo "# 安装 Node.js"
echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
echo "sudo apt install -y nodejs"
echo
echo "# 安装 Poetry"
echo "curl -sSL https://install.python-poetry.org | python3 -"
echo
echo "# 安装其他必需包"
echo "sudo apt install -y build-essential python3-dev jq dnsutils netcat"
echo
echo "# 安装 cloudflared"
echo "wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
echo "sudo dpkg -i cloudflared-linux-amd64.deb"
echo "```"
echo

echo -e "${BOLD}${YELLOW}🗄️ 第二步：启动基础服务${NC}"
echo "```bash"
echo "# 启动 PostgreSQL"
echo "sudo systemctl start postgresql"
echo "sudo systemctl enable postgresql"
echo
echo "# 启动 Redis"
echo "sudo systemctl start redis-server"
echo "sudo systemctl enable redis-server"
echo
echo "# 创建数据库和用户"
echo "sudo -u postgres psql << 'EOSQL'"
echo "CREATE USER synapse_user WITH PASSWORD '$POSTGRES_PASSWORD';"
echo "CREATE DATABASE synapse"
echo "    WITH ENCODING='UTF8'"
echo "    LC_COLLATE='C'"
echo "    LC_CTYPE='C'"
echo "    TEMPLATE=template0"
echo "    OWNER=synapse_user;"
echo "GRANT ALL PRIVILEGES ON DATABASE synapse TO synapse_user;"
echo "EOSQL"
echo "```"
echo

echo -e "${BOLD}${YELLOW}⚙️ 第三步：配置 Synapse${NC}"
echo "```bash"
echo "# 创建 Synapse 用户"
echo "sudo adduser --system --no-create-home synapse"
echo "sudo addgroup synapse"
echo "sudo usermod -a -G synapse synapse"
echo
echo "# 创建必要目录"
echo "sudo mkdir -p /var/lib/matrix-synapse/media_store"
echo "sudo mkdir -p /var/log/matrix-synapse"
echo "sudo mkdir -p /etc/matrix-synapse"
echo
echo "# 设置权限"
echo "sudo chown -R synapse:synapse /var/lib/matrix-synapse"
echo "sudo chown -R synapse:synapse /var/log/matrix-synapse"
echo "sudo chown -R synapse:synapse /etc/matrix-synapse"
echo "sudo chmod 700 /var/lib/matrix-synapse"
echo "sudo chmod 750 /var/log/matrix-synapse"
echo "sudo chmod 700 /etc/matrix-synapse"
echo
echo "# 安装 Synapse 依赖"
echo "cd /home/shijian/projects/privchat-synapse"
echo "export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "/root/.local/bin/poetry install"
echo "python build_rust.py"
echo
echo "# 生成签名密钥"
echo "sudo -u synapse bash -c \"cd /etc/matrix-synapse && \\"
echo "    /root/.local/bin/poetry run python -m synapse.crypto.keygen \\"
echo "    --key-type ed25519 \\"
echo "    --output \\\"/etc/matrix-synapse/$SERVER_NAME.signing.key\\\""
echo "sudo chmod 600 /etc/matrix-synapse/$SERVER_NAME.signing.key"
echo "```"
echo

echo -e "${BOLD}${YELLOW}📝 第四步：创建配置文件${NC}"
echo "```bash"
echo "# 复制配置文件"
echo "sudo cp /home/shijian/projects/privchat-synapse/config/homeserver_matrix_production.yaml /etc/matrix-synapse/homeserver.yaml"
echo "sudo cp /home/shijian/projects/privchat-synapse/config/log_config_production.yaml /etc/matrix-synapse/log_config.yaml"
echo
echo "# 编辑主配置文件"
echo "sudo nano /etc/matrix-synapse/homeserver.yaml"
echo "```"
echo

echo -e "${BOLD}${YELLOW}⚠️ 第五步：修改配置文件${NC}"
echo "在 /etc/matrix-synapse/homeserver.yaml 中修改以下配置："
echo
echo -e "${GREEN}必须修改的配置项：${NC}"
echo "```yaml"
echo "server_name: \"$MATRIX_DOMAIN\""
echo "public_baseurl: \"https://$MATRIX_DOMAIN\""
echo ""
echo "database:"
echo "  name: psycopg2"
echo "  args:"
echo "    user: synapse_user"
echo "    password: \"$POSTGRES_PASSWORD\""
echo "    dbname: synapse"
echo "    host: 127.0.0.1"
echo "    port: 5432"
echo ""
echo "registration:"
echo "  enable_registration: false"
echo "  registration_shared_secret: \"$REGISTRATION_SECRET\""
echo ""
echo "signing_key_path: \"/etc/matrix-synapse/$SERVER_NAME.signing.key\""
echo ""
echo "dashboard:"
echo "  enabled: true"
echo "  default_cache_ttl_seconds: 300"
echo "  redis_channel_user_events:"
echo "    - \"dashboard.user.invalidate\""
echo "```"
echo

echo -e "${BOLD}${YELLOW}🔐 第六步：配置 Cloudflare Tunnel${NC}"
echo "```bash"
echo "# 登录 Cloudflare"
echo "cloudflared tunnel login"
echo
echo "# 创建 tunnel"
echo "cloudflared tunnel create matrix-tunnel"
echo "```"
echo
echo -e "${YELLOW}记下返回的 TUNNEL_UUID，然后继续：${NC}"
echo

echo -e "${BOLD}${YELLOW}📁 第七步：创建 tunnel 配置${NC}"
echo "```bash"
echo "# 创建配置目录"
echo "mkdir -p ~/.cloudflared"
echo
echo "# 创建配置文件"
echo "cat > ~/.cloudflared/config.yml << 'EOF'"
echo "tunnel: YOUR_TUNNEL_UUID  # 替换为实际的 UUID"
echo "credentials-file: ~/.cloudflared/YOUR_TUNNEL_UUID.json"
echo ""
echo "ingress:"
echo "  - hostname: $MATRIX_DOMAIN"
echo "    service: http://127.0.0.1:8008"
echo "  - hostname: $DASHBOARD_DOMAIN"
echo "    service: http://127.0.0.1:3001"
echo "  - service: http_status:404"
echo "EOF"
echo "```"
echo

echo -e "${BOLD}${YELLOW}🌐 第八步：配置 DNS 路由${NC}"
echo "```bash"
echo "# 替换 TUNNEL_UUID 为实际的 tunnel UUID"
echo "cloudflared tunnel route dns YOUR_TUNNEL_UUID $MATRIX_DOMAIN"
echo "cloudflared tunnel route dns YOUR_TUNNEL_UUID $DASHBOARD_DOMAIN"
echo
echo "# 安装为系统服务"
echo "sudo cp ~/.cloudflared/config.yml /etc/cloudflared/"
echo "sudo cp ~/.cloudflared/YOUR_TUNNEL_UUID.json /etc/cloudflared/"
echo "sudo chown -R root:cloudflared /etc/cloudflared/"
echo "sudo chmod 600 /etc/cloudflared/YOUR_TUNNEL_UUID.json"
echo "sudo cloudflared service install"
echo "```"
echo

echo -e "${BOLD}${YELLOW}🎛️ 第九步：配置 Dashboard${NC}"
echo "```bash"
echo "# 创建 Dashboard 目录"
echo "sudo mkdir -p /opt/matrix-dashboard"
echo "sudo mkdir -p /var/lib/matrix-dashboard/uploads"
echo "sudo mkdir -p /var/log/matrix-dashboard"
echo
echo "# 创建环境变量文件"
echo "sudo tee /opt/matrix-dashboard/.env > /dev/null << 'EOF'"
echo "NODE_ENV=production"
echo "PORT=3001"
echo "DASHBOARD_HOST=127.0.0.1"
echo "LOG_LEVEL=info"
echo ""
echo "# JWT 配置"
echo "JWT_SECRET=$JWT_SECRET"
echo "JWT_REFRESH_SECRET=$(generate_secret)"
echo "JWT_ACCESS_TTL_SECONDS=900"
echo "JWT_REFRESH_TTL_SECONDS=604800"
echo ""
echo "# CORS 配置"
echo "CORS_ORIGINS=https://$DASHBOARD_DOMAIN,https://$MATRIX_DOMAIN"
echo ""
echo "# 数据库配置"
echo "DB_HOST=127.0.0.1"
echo "DB_PORT=5432"
echo "DB_NAME=synapse"
echo "DB_USER=synapse_user"
echo "DB_PASSWORD=$POSTGRES_PASSWORD"
echo ""
echo "# Redis 配置"
echo "REDIS_HOST=127.0.0.1"
echo "REDIS_PORT=6379"
echo "REDIS_USER_EVENTS_CHANNEL=dashboard.user.invalidate"
echo ""
echo "# Synapse 集成"
echo "SYNAPSE_SERVER_URL=http://127.0.0.1:8008"
echo "SYNAPSE_SERVER_NAME=$SERVER_NAME"
echo "EOF"
echo ""
echo "# 设置权限"
echo "sudo chown -R root:root /opt/matrix-dashboard"
echo "sudo chmod 600 /opt/matrix-dashboard/.env"
echo "```"
echo

echo -e "${BOLD}${YELLOW}🚀 第十步：创建并启动服务${NC}"
echo "```bash"
echo "# 创建 Synapse 服务"
echo "sudo tee /etc/systemd/system/matrix-synapse.service > /dev/null << 'EOF'"
echo "[Unit]"
echo "Description=Matrix Synapse homeserver"
echo "After=network-online.target postgresql.service redis.service"
echo "Wants=network-online.target postgresql.service redis.service"
echo ""
echo "[Service]"
echo "Type=notify"
echo "NotifyAccess=all"
echo "User=synapse"
echo "Group=synapse"
echo "WorkingDirectory=/var/lib/matrix-synapse"
echo "Environment=PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin"
echo "Environment=PYTHONPATH=/home/shijian/projects/privchat-synapse"
echo "ExecStart=/root/.local/bin/poetry run python -m synapse.app.homeserver \\"
echo "    --config-path=/etc/matrix-synapse/homeserver.yaml \\"
echo "    --config-path=/etc/matrix-synapse/log_config.yaml"
echo "Restart=always"
echo "RestartSec=10"
echo "LimitNOFILE=65536"
echo ""
echo "[Install]"
echo "WantedBy=multi-user.target"
echo "EOF"
echo ""
echo "# 创建简单的 Dashboard 服务"
echo "sudo tee /opt/matrix-dashboard/server.js > /dev/null << 'EOF'"
echo "const express = require('express');"
echo "const app = express();"
echo "const PORT = process.env.PORT || 3001;"
echo ""
echo "app.use(express.json());"
echo ""
echo "app.get('/health', (req, res) => {"
echo "    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'matrix-dashboard' });"
echo "});"
echo ""
echo "app.get('/', (req, res) => {"
echo "    res.json({"
echo "        message: 'Matrix Dashboard API',"
echo "        version: '1.0.0',"
echo "        endpoints: ['/health', '/api/v1']"
echo "    });"
echo "});"
echo ""
echo "app.use('*', (req, res) => {"
echo "    res.status(404).json({ error: 'Not Found' });"
echo "});"
echo ""
echo "app.listen(PORT, '127.0.0.1', () => {"
echo "    console.log(\`Matrix Dashboard server running on http://127.0.0.1:\${PORT}\`);"
echo "});"
echo "EOF"
echo ""
echo "# 安装 Node.js 依赖"
echo "cd /opt/matrix-dashboard"
echo "sudo npm init -y"
echo "sudo npm install express cors"
echo ""
echo "# 创建 Dashboard systemd 服务"
echo "sudo tee /etc/systemd/system/matrix-dashboard.service > /dev/null << 'EOF'"
echo "[Unit]"
echo "Description=Matrix Dashboard API"
echo "After=network-online.target postgresql.service redis.service matrix-synapse.service"
echo "Wants=network-online.target postgresql.service redis.service matrix-synapse.service"
echo ""
echo "[Service]"
echo "Type=simple"
echo "User=root"
echo "Group=root"
echo "WorkingDirectory=/opt/matrix-dashboard"
echo "Environment=NODE_ENV=production"
echo "EnvironmentFile=/opt/matrix-dashboard/.env"
echo "ExecStart=/usr/bin/node server.js"
echo "Restart=always"
echo "RestartSec=10"
echo "StandardOutput=journal"
echo "StandardError=journal"
echo ""
echo "[Install]"
echo "WantedBy=multi-user.target"
echo "EOF"
echo
echo "# 重新加载 systemd"
echo "sudo systemctl daemon-reload"
echo
echo "# 启动所有服务"
echo "sudo systemctl start postgresql redis-server"
echo "sudo systemctl start matrix-synapse"
echo "sudo systemctl start matrix-dashboard"
echo "sudo systemctl start cloudflared"
echo ""
echo "# 启用开机自启"
echo "sudo systemctl enable postgresql redis-server"
echo "sudo systemctl enable matrix-synapse"
echo "sudo systemctl enable matrix-dashboard"
echo "sudo systemctl enable cloudflared"
echo "```"
echo

echo -e "${BOLD}${YELLOW}👤 第十一步：创建管理员用户${NC}"
echo "```bash"
echo "# 创建管理员账户"
echo "cd /home/shijian/projects/privchat-synapse"
echo "/root/.local/bin/poetry run register_new_matrix_user \\"
echo "    --config /etc/matrix-synapse/homeserver.yaml \\"
echo "    --user admin \\"
echo "    --password '$ADMIN_PASSWORD' \\"
echo "    --admin"
echo "```"
echo

echo -e "${BOLD}${YELLOW}✅ 第十二步：验证部署${NC}"
echo "```bash"
echo "# 检查服务状态"
echo "sudo systemctl status postgresql redis-server matrix-synapse matrix-dashboard cloudflared"
echo
echo "# 检查本地连接"
echo "curl -I http://127.0.0.1:8008"
echo "curl -I http://127.0.0.1:3001"
echo
echo "# 检查公网连接"
echo "curl -I https://$MATRIX_DOMAIN"
echo "curl -I https://$DASHBOARD_DOMAIN"
echo
echo "# 测试 Matrix API"
echo "curl -s https://$MATRIX_DOMAIN/_matrix/server/versions | jq"
echo
echo "# 测试 .well-known 配置"
echo "curl -s https://$MATRIX_DOMAIN/.well-known/matrix/server | jq"
echo "curl -s https://$MATRIX_DOMAIN/.well-known/matrix/client | jq"
echo "```"
echo

echo -e "${BOLD}${YELLOW}🌐 访问地址${NC}"
echo "📱 Matrix 服务器: ${GREEN}https://$MATRIX_DOMAIN${NC}"
echo "🎛️ Dashboard 管理界面: ${GREEN}https://$DASHBOARD_DOMAIN${NC}"
echo "🧪 联邦测试: ${GREEN}https://federationtester.matrix.org/api/report?server_name=$MATRIX_DOMAIN${NC}"
echo

echo -e "${BOLD}${YELLOW}🔧 服务管理命令${NC}"
echo "```bash"
echo "# 启动服务"
echo "sudo systemctl start matrix-synapse matrix-dashboard cloudflared"
echo
echo "# 停止服务"
echo "sudo systemctl stop matrix-synapse matrix-dashboard cloudflared"
echo
echo "# 重启服务"
echo "sudo systemctl restart matrix-synapse matrix-dashboard cloudflared"
echo
echo "# 查看服务状态"
echo "sudo systemctl status matrix-synapse matrix-dashboard cloudflared"
echo
echo "# 查看日志"
echo "sudo journalctl -u matrix-synapse -f"
echo "sudo journalctl -u matrix-dashboard -f"
echo "sudo journalctl -u cloudflared -f"
echo "```"
echo

echo -e "${BOLD}${YELLOW}📝 重要提醒${NC}"
echo "1. ${RED}请将 $MATRIX_DOMAIN 和 $DASHBOARD_DOMAIN 替换为您的实际域名${NC}"
echo "2. ${RED}请妥善保存所有密码和密钥：${NC}"
echo "   - PostgreSQL 密码: $POSTGRES_PASSWORD"
echo "   - 管理员密码: $ADMIN_PASSWORD"
echo "   - JWT 密钥: $JWT_SECRET"
echo "3. ${RED}确保您的域名已添加到 Cloudflare 并正确配置${NC}"
echo "4. ${RED}运行 'cloudflared tunnel login' 时请在浏览器中登录您的 Cloudflare 账户${NC}"
echo "5. ${RED}替换 YOUR_TUNNEL_UUID 为 cloudflared 返回的实际 UUID${NC}"
echo

echo -e "${BOLD}${GREEN}🎉 快速部署命令生成完成！${NC}"
echo -e "${YELLOW}请按顺序复制粘贴以上命令执行部署。${NC}"
echo -e "${YELLOW}如果在部署过程中遇到问题，请查看服务日志进行排查。${NC}"