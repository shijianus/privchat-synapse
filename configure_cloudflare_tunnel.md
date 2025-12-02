# Cloudflare Tunnel 配置指南

请按照以下步骤配置 Cloudflare Tunnel，将您的 Matrix Synapse 服务暴露到公网：

## 第一步：登录 Cloudflare

```bash
cloudflared tunnel login
```

这会打开一个浏览器窗口，请登录您的 Cloudflare 账户并授权访问您的域名。

## 第二步：创建 Tunnel

```bash
cloudflared tunnel create matrix-tunnel
```

**重要：请记下返回的 TUNNEL_UUID！** 这将类似于 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

## 第三步：创建 Tunnel 配置文件

```bash
# 创建配置目录
mkdir -p ~/.cloudflared

# 创建配置文件（请替换 YOUR_TUNNEL_UUID 为实际的 UUID）
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: YOUR_TUNNEL_UUID  # 替换为实际的 UUID
credentials-file: ~/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: chat.831511.xyz
    service: http://127.0.0.1:8008
  - hostname: admin.chat.831511.xyz
    service: http://127.0.0.1:3001
  - service: http_status:404
EOF
```

## 第四步：配置 DNS 路由

```bash
# 替换 YOUR_TUNNEL_UUID 为实际的 UUID
cloudflared tunnel route dns YOUR_TUNNEL_UUID chat.831511.xyz
cloudflared tunnel route dns YOUR_TUNNEL_UUID admin.chat.831511.xyz
```

## 第五步：安装为系统服务

```bash
# 复制配置文件到系统目录
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/
sudo cp ~/.cloudflared/YOUR_TUNNEL_UUID.json /etc/cloudflared/

# 设置权限
sudo chown -R root:cloudflared /etc/cloudflared/
sudo chmod 600 /etc/cloudflared/YOUR_TUNNEL_UUID.json

# 安装并启动服务
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# 检查服务状态
sudo systemctl status cloudflared --no-pager
```

## 第六步：验证配置

```bash
# 检查本地 Synapse 服务
curl -I http://127.0.0.1:8008

# 检查公网访问
curl -I https://chat.831511.xyz

# 测试 Matrix API
curl -s https://chat.831511.xyz/_matrix/server/versions | jq

# 测试 .well-known 配置
curl -s https://chat.831511.xyz/.well-known/matrix/server | jq
curl -s https://chat.831511.xyz/.well-known/matrix/client | jq
```

## 服务管理命令

```bash
# 启动服务
sudo systemctl start cloudflared

# 停止服务
sudo systemctl stop cloudflared

# 重启服务
sudo systemctl restart cloudflared

# 查看状态
sudo systemctl status cloudflared

# 查看日志
sudo journalctl -u cloudflared -f --no-pager
```

## 完成后访问地址

- 📱 **Matrix 服务器**: https://chat.831511.xyz
- 🎛️ **Dashboard 管理界面**: https://admin.chat.831511.xyz（后续配置）
- 🧪 **联邦测试**: https://federationtester.matrix.org/api/report?server_name=chat.831511.xyz

## 故障排除

1. **如果 cloudflared 无法连接**：
   ```bash
   sudo journalctl -u cloudflared -f --no-pager
   ```

2. **如果 DNS 记录未生效**：
   - 等待几分钟让 DNS 传播
   - 检查 Cloudflare DNS 设置页面

3. **如果隧道配置错误**：
   - 检查 `~/.cloudflared/config.yml` 文件格式
   - 确保 TUNNEL_UUID 正确

4. **如果 Synapse 服务未启动**：
   ```bash
   sudo systemctl status matrix-synapse
   sudo journalctl -u matrix-synapse -f --no-pager
   ```

## 注意事项

- 确保 `chat.831511.xyz` 和 `admin.chat.831511.xyz` 已添加到您的 Cloudflare 账户
- Tunnel 只会转发 HTTP/HTTPS 流量到您指定的本地服务
- 所有的域名解析都由 Cloudflare 处理，您不需要在本地配置 DNS