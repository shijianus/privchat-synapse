#!/bin/bash

# Matrix Synapse 手动配置和部署脚本
# 请按照顺序执行这些命令

set -euo pipefail

echo "🚀 Matrix Synapse 手动配置和部署"
echo "=================================="
echo

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 配置变量
MATRIX_DOMAIN="chat.831511.xyz"
DASHBOARD_DOMAIN="admin.chat.831511.xyz"
SERVER_NAME="chat.831511.xyz"
POSTGRES_PASSWORD="APLN7cqDQyVkb8jw8sKJkT24JRpjzDx1"
JWT_SECRET="c7a0dd3e6e2d2d6852544f7a2b00adbc1adb6228a5d0d55faa39bb994b1cf068360713cccb9cc1299663344b869c82bc82d2579f49a05cf4a012291c8168ccfd"
REGISTRATION_SECRET="8dd73c6bc6d30f76bf89f263ba56965d4c50dfd1a02407fb8287f5feedbdd950"
ADMIN_PASSWORD="AwY1zB0mSqGqb94VVBw7IG71ZbPwfmgu"

echo -e "${BOLD}${YELLOW}📋 配置信息${NC}"
echo -e "Matrix 域名: ${GREEN}$MATRIX_DOMAIN${NC}"
echo -e "Dashboard 域名: ${GREEN}$DASHBOARD_DOMAIN${NC}"
echo -e "服务器名称: ${GREEN}$SERVER_NAME${NC}"
echo -e "PostgreSQL 密码: ${GREEN}$POSTGRES_PASSWORD${NC}"
echo -e "管理员密码: ${GREEN}$ADMIN_PASSWORD${NC}"
echo

echo -e "${BOLD}${YELLOW}🔑 第一步：生成 Synapse 签名密钥${NC}"
echo "请执行以下命令："
echo
echo "# 生成签名密钥"
echo "sudo -u synapse bash -c \"cd /etc/matrix-synapse && /root/.local/bin/poetry run python -m synapse.crypto.keygen --key-type ed25519 --output \\\"/etc/matrix-synapse/$SERVER_NAME.signing.key\\\"\""
echo
echo "# 设置密钥文件权限"
echo "sudo chmod 600 /etc/matrix-synapse/$SERVER_NAME.signing.key"
echo "sudo chown synapse:synapse /etc/matrix-synapse/$SERVER_NAME.signing.key"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}📝 第二步：创建配置文件${NC}"
echo "请执行以下命令："
echo
echo "# 复制配置文件"
echo "sudo cp /home/shijian/projects/privchat-synapse/config/homeserver_matrix_production.yaml /etc/matrix-synapse/homeserver.yaml"
echo "sudo cp /home/shijian/projects/privchat-synapse/config/log_config_production.yaml /etc/matrix-synapse/log_config.yaml"
echo
echo "# 设置配置文件权限"
echo "sudo chown synapse:synapse /etc/matrix-synapse/homeserver.yaml"
echo "sudo chown synapse:synapse /etc/matrix-synapse/log_config.yaml"
echo "sudo chmod 600 /etc/matrix-synapse/homeserver.yaml"
echo "sudo chmod 644 /etc/matrix-synapse/log_config.yaml"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}⚙️ 第三步：编辑主配置文件${NC}"
echo "请编辑 /etc/matrix-synapse/homeserver.yaml 文件："
echo
echo "sudo nano /etc/matrix-synapse/homeserver.yaml"
echo
echo -e "${YELLOW}需要修改的配置项：${NC}"
echo "1. server_name: \"$SERVER_NAME\""
echo "2. public_baseurl: \"https://$MATRIX_DOMAIN\""
echo "3. 修改数据库密码为: $POSTGRES_PASSWORD"
echo "4. registration_shared_secret: \"$REGISTRATION_SECRET\""
echo "5. signing_key_path: \"/etc/matrix-synapse/$SERVER_NAME.signing.key\""
echo "6. 确保 dashboard 部分已启用"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}🛠️ 第四步：创建 systemd 服务文件${NC}"
echo "请执行以下命令创建 Synapse 服务："
echo
echo "# 创建服务文件"
echo "sudo tee /etc/systemd/system/matrix-synapse.service > /dev/null << 'EOF'"
echo "[Unit]"
echo "Description=Matrix Synapse homeserver"
echo "After=network-online.target postgresql.service redis.service"
echo "Wants=network-online.target postgresql.service redis.service"
echo
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
echo
echo "[Install]"
echo "WantedBy=multi-user.target"
echo "EOF"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}🚀 第五步：启动 Synapse 服务${NC}"
echo "请执行以下命令："
echo
echo "# 重新加载 systemd"
echo "sudo systemctl daemon-reload"
echo
echo "# 启动 Synapse 服务"
echo "sudo systemctl start matrix-synapse"
echo "sudo systemctl enable matrix-synapse"
echo
echo "# 检查服务状态"
echo "sudo systemctl status matrix-synapse"
echo
echo "# 查看日志（如有问题）"
echo "sudo journalctl -u matrix-synapse -f --no-pager"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}👤 第六步：创建管理员用户${NC}"
echo "请执行以下命令："
echo
echo "# 切换到项目目录"
echo "cd /home/shijian/projects/privchat-synapse"
echo
echo "# 创建管理员账户"
echo "/root/.local/bin/poetry run register_new_matrix_user \\"
echo "    --config /etc/matrix-synapse/homeserver.yaml \\"
echo "    --user admin \\"
echo "    --password '$ADMIN_PASSWORD' \\"
echo "    --admin"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}🌐 第七步：配置 Cloudflare Tunnel${NC}"
echo "请执行以下命令："
echo
echo "# 登录 Cloudflare"
echo "cloudflared tunnel login"
echo
echo "# 创建 tunnel"
echo "cloudflared tunnel create matrix-tunnel"
echo
echo -e "${RED}重要：记下返回的 TUNNEL_UUID！${NC}"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}📁 第八步：创建 tunnel 配置${NC}"
echo "请执行以下命令（替换 YOUR_TUNNEL_UUID 为实际的 UUID）："
echo
echo "# 创建配置目录"
echo "mkdir -p ~/.cloudflared"
echo
echo "# 创建配置文件"
echo "cat > ~/.cloudflared/config.yml << 'EOF'"
echo "tunnel: YOUR_TUNNEL_UUID  # 替换为实际的 UUID"
echo "credentials-file: ~/.cloudflared/YOUR_TUNNEL_UUID.json"
echo
echo "ingress:"
echo "  - hostname: $MATRIX_DOMAIN"
echo "    service: http://127.0.0.1:8008"
echo "  - service: http_status:404"
echo "EOF"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}🌍 第九步：配置 DNS 路由${NC}"
echo "请执行以下命令（替换 YOUR_TUNNEL_UUID 为实际的 UUID）："
echo
echo "# 配置 DNS 路由"
echo "cloudflared tunnel route dns YOUR_TUNNEL_UUID $MATRIX_DOMAIN"
echo
echo "# 安装为系统服务"
echo "sudo cp ~/.cloudflared/config.yml /etc/cloudflared/"
echo "sudo cp ~/.cloudflared/YOUR_TUNNEL_UUID.json /etc/cloudflared/"
echo "sudo chown -R root:cloudflared /etc/cloudflared/"
echo "sudo chmod 600 /etc/cloudflared/YOUR_TUNNEL_UUID.json"
echo "sudo cloudflared service install"
echo "sudo systemctl enable cloudflared"
echo "sudo systemctl start cloudflared"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}🔍 第十步：验证部署${NC}"
echo "请执行以下命令验证部署："
echo
echo "# 检查本地连接"
echo "curl -I http://127.0.0.1:8008"
echo
echo "# 检查公网连接"
echo "curl -I https://$MATRIX_DOMAIN"
echo
echo "# 测试 Matrix API"
echo "curl -s https://$MATRIX_DOMAIN/_matrix/server/versions | jq"
echo
echo "# 测试 .well-known 配置"
echo "curl -s https://$MATRIX_DOMAIN/.well-known/matrix/server | jq"
echo "curl -s https://$MATRIX_DOMAIN/.well-known/matrix/client | jq"
echo
echo "按回车键继续..."
read

echo -e "${BOLD}${YELLOW}🌐 访问地址${NC}"
echo "📱 Matrix 服务器: ${GREEN}https://$MATRIX_DOMAIN${NC}"
echo "🧪 联邦测试: ${GREEN}https://federationtester.matrix.org/api/report?server_name=$MATRIX_DOMAIN${NC}"
echo

echo -e "${BOLD}${YELLOW}🔧 服务管理命令${NC}"
echo "启动服务: sudo systemctl start matrix-synapse cloudflared"
echo "停止服务: sudo systemctl stop matrix-synapse cloudflared"
echo "重启服务: sudo systemctl restart matrix-synapse cloudflared"
echo "查看状态: sudo systemctl status matrix-synapse cloudflared"
echo "查看日志: sudo journalctl -u matrix-synapse -f"
echo

echo -e "${BOLD}${GREEN}🎉 配置完成！${NC}"
echo -e "${YELLOW}请按照上述步骤逐一执行命令完成部署。${NC}"