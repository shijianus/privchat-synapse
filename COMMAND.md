# COMMAND.md — 部署与运维快捷命令

以下命令默认在主机上执行，除非特别说明。请按顺序操作。

## 1) 核查服务状态与日志
- 检查 Synapse 服务状态：`systemctl status matrix-synapse --no-pager`
- 查看实时日志：`journalctl -u matrix-synapse -f --no-pager`
- 健康检查（本地）：`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8088/health`

## 2) 创建/重置管理员账号
- 创建管理员（已存在会失败，可换用户名）：\
  `sudo -u synapse /var/lib/matrix-synapse/venv/bin/register_new_matrix_user --config /etc/matrix-synapse/homeserver.yaml --user admin --password 'AwY1zB0mSqGqb94VVBw7IG71ZbPwfmgu' --admin`

## 3) Cloudflare Tunnel 配置与启动
> 需要先登录 Cloudflare 账户并选择对应站点。

1. 登录并创建隧道（记下 TUNNEL_UUID）：\
   ```
   cloudflared tunnel login
   cloudflared tunnel create matrix-tunnel
   ```
2. 写入本地配置（替换 <TUNNEL_UUID>）：\
   ```
   mkdir -p ~/.cloudflared
   cat > ~/.cloudflared/config.yml <<'EOF'
   tunnel: <TUNNEL_UUID>
   credentials-file: ~/.cloudflared/<TUNNEL_UUID>.json

   ingress:
     - hostname: chat.831511.xyz
       service: http://127.0.0.1:8008
     - service: http_status:404
   EOF
   ```
3. 绑定 DNS 到隧道：\
   `cloudflared tunnel route dns <TUNNEL_UUID> chat.831511.xyz`
4. 安装为系统服务并启动：\
   ```
   sudo cp ~/.cloudflared/config.yml /etc/cloudflared/
   sudo cp ~/.cloudflared/<TUNNEL_UUID>.json /etc/cloudflared/
   sudo chown -R root:cloudflared /etc/cloudflared/
   sudo chmod 600 /etc/cloudflared/<TUNNEL_UUID>.json
   sudo cloudflared service install
   sudo systemctl enable cloudflared
   sudo systemctl start cloudflared
   systemctl status cloudflared --no-pager
   ```

## 4) 常用运维操作
- 重启 Synapse：`systemctl restart matrix-synapse`
- 查看监听端口：`ss -lnpt | grep matrix-synapse`  (应只监听 127.0.0.1:8008/8088)
- 查看日志目录权限：`ls -l /var/log/matrix-synapse`

## 5) 可选配置优化
- 关闭 key server 提示（若接受信任 matrix.org）：在 `/etc/matrix-synapse/homeserver.yaml` 增加 `suppress_key_server_warning: true`，然后重启服务。
- 替换 metrics_port 为 metrics listener（参考官方文档）以消除弃用警告。
