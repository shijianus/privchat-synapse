#!/bin/bash

# Cloudflare Tunnel 配置脚本
set -euo pipefail

# 配置变量
MATRIX_DOMAIN="chat.831511.xyz"
DASHBOARD_DOMAIN="admin.chat.831511.xyz"

echo "🌐 配置 Cloudflare Tunnel..."
echo "Matrix 域名: $MATRIX_DOMAIN"
echo "Dashboard 域名: $DASHBOARD_DOMAIN"
echo

echo "第一步：登录 Cloudflare"
echo "执行: cloudflared tunnel login"
echo "请在浏览器中登录您的 Cloudflare 账户"
echo

echo "第二步：创建 tunnel"
echo "执行: cloudflared tunnel create matrix-tunnel"
echo "请记下返回的 TUNNEL_UUID！"
echo

echo "第三步：创建 tunnel 配置文件"
echo "请替换 YOUR_TUNNEL_UUID 为实际的 UUID："
echo
echo "mkdir -p ~/.cloudflared"
echo
echo "cat > ~/.cloudflared/config.yml << 'EOF'"
echo "tunnel: YOUR_TUNNEL_UUID  # 替换为实际的 UUID"
echo "credentials-file: ~/.cloudflared/YOUR_TUNNEL_UUID.json"
echo
echo "ingress:"
echo "  - hostname: $MATRIX_DOMAIN"
echo "    service: http://127.0.0.1:8008"
echo "  - hostname: $DASHBOARD_DOMAIN"
echo "    service: http://127.0.0.1:3001"
echo "  - service: http_status:404"
echo "EOF"
echo

echo "第四步：配置 DNS 路由"
echo "请替换 YOUR_TUNNEL_UUID 为实际的 UUID："
echo
echo "cloudflared tunnel route dns YOUR_TUNNEL_UUID $MATRIX_DOMAIN"
echo "cloudflared tunnel route dns YOUR_TUNNEL_UUID $DASHBOARD_DOMAIN"
echo

echo "第五步：安装为系统服务"
echo
echo "sudo cp ~/.cloudflared/config.yml /etc/cloudflared/"
echo "sudo cp ~/.cloudflared/YOUR_TUNNEL_UUID.json /etc/cloudflared/"
echo "sudo chown -R root:cloudflared /etc/cloudflared/"
echo "sudo chmod 600 /etc/cloudflared/YOUR_TUNNEL_UUID.json"
echo "sudo cloudflared service install"
echo "sudo systemctl enable cloudflared"
echo "sudo systemctl start cloudflared"
echo

echo "✅ Cloudflare Tunnel 配置完成"
echo "🌐 访问地址: https://$MATRIX_DOMAIN"
echo "🔧 管理命令: sudo systemctl status cloudflared"