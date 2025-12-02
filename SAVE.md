# Rescue / Bring-Up Playbook (chat.831511.xyz)

本文件给出在真实主机上将 Matrix Synapse + Dashboard + Cloudflare Tunnel 拉起并验证的完整操作步骤。当前沙箱无法创建/监听 socket（`bind/connect` 会 EPERM），所以以下命令需在具备正常网络权限的环境中执行。

## 0. 现状速览
- Synapse 正在以 systemd 运行，配置在 `/etc/matrix-synapse/homeserver.yaml`，server_name `chat.831511.xyz`，监听 127.0.0.1:8008/8088。
- PostgreSQL 16 已运行（cluster `16/main`），Redis 7 已运行，cloudflared 正在跑，隧道 ID `838e2463-3bad-4129-a0a2-63d9abf0f215`。
- 日志显示 Redis 认证报错（Synapse 发送 AUTH，但 Redis 未设密码）。需统一 Redis 密码配置。
- Dashboard 后端代码在 `dashboard/backend`，默认端口 3001；前端在 `dashboard/frontend`，默认 dev 端口 3000。

## 1. 基础自检（需 root 或 sudo）
```bash
systemctl status postgresql redis-server matrix-synapse cloudflared
pg_isready -h 127.0.0.1 -p 5432
redis-cli -h 127.0.0.1 PING
```
若 Redis 无密码返回 `PONG`，记下：Synapse 配置应将 `redis.password` 留空；若计划加密码，请同步更新两端（第 2 步）。

## 2. 统一 Redis 认证策略
选择其一：
1) **无密码方案（最快）**  
   - 编辑 `/etc/matrix-synapse/homeserver.yaml`，确保 `redis.password: ""`（空字符串）。  
   - 重启 Synapse：`systemctl restart matrix-synapse`。  
   - 观察 `/var/log/matrix-synapse/homeserver.log` 确认不再出现 “AUTH called without any password configured”。
2) **有密码方案（更安全）**  
   - 设置 Redis 密码（追加到 `/etc/redis/redis.conf`）：`requirepass <strong-password>`，然后 `systemctl restart redis-server`。  
   - 同步修改 `/etc/matrix-synapse/homeserver.yaml` 的 `redis.password` 为相同密码。  
   - 重启 Synapse 并确认日志无报错。

## 3. PostgreSQL 连接确认
从 `/etc/matrix-synapse/homeserver.yaml` 获取 DB 密码（当前写为 `SmartKevin520`，如已替换请按实值）：
```bash
PGPASSWORD='<DB_PASSWORD>' psql -h 127.0.0.1 -U synapse_user -d synapse -c "SELECT 1;"
```
若失败，检查 `pg_hba.conf` 是否允许 127.0.0.1/md5，并重启 postgres。

## 4. Synapse 服务健康检查
```bash
systemctl restart matrix-synapse
systemctl status matrix-synapse
tail -f /var/log/matrix-synapse/homeserver.log
curl -f http://127.0.0.1:8008/_matrix/client/versions
curl -f http://127.0.0.1:8088/health || true  # 健康端口如启用
```
确保 curl 返回 200/JSON；若端口被占用，先排查 `ss -ltnp | grep 8008`。

## 5. Cloudflared 隧道与公网上线
配置文件：`/etc/cloudflared/config.yml`
```yaml
tunnel: 838e2463-3bad-4129-a0a2-63d9abf0f215
credentials-file: /home/shijian/.cloudflared/838e2463-3bad-4129-a0a2-63d9abf0f215.json
ingress:
  - hostname: chat.831511.xyz
    service: http://127.0.0.1:8008
  - hostname: admin.chat.831511.xyz
    service: http://127.0.0.1:3001
  - service: http_status:404
```
操作步骤：
```bash
systemctl restart cloudflared
systemctl status cloudflared
cloudflared tunnel info 838e2463-3bad-4129-a0a2-63d9abf0f215
```
在 Cloudflare Dashboard (Zero Trust > Networks > Tunnels)：
- 选择隧道 `matrix-tunnel`，在 “Public Hostnames” 添加/确认两条路由：
  - `chat.831511.xyz` -> `http://127.0.0.1:8008` (橙云开启)
  - `admin.chat.831511.xyz` -> `http://127.0.0.1:3001` (橙云开启)
- DNS 页面不要有直连 A 记录；保持 CNAME/隧道路由为代理状态。
- SSL/TLS 模式设为 **Full (strict)**。

公网验证（完成 Dashboard 后端启动后再测 3001）：
```bash
curl -v https://chat.831511.xyz/_matrix/client/versions
curl -v https://admin.chat.831511.xyz/health/ready
```

## 6. Dashboard 后端 (dashboard/backend)
环境变量文件：`dashboard/backend/.env`（当前内容示例）
```
PORT=3001
DASHBOARD_HOST=0.0.0.0
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=synapse
DB_USER=synapse_user
DB_PASSWORD=<同 Synapse DB 密码>
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=<与 Redis 实际一致，若无密码则留空>
JWT_SECRET=<32+ 随机>
JWT_REFRESH_SECRET=<32+ 随机>
```
操作步骤：
```bash
cd /home/shijian/projects/privchat-synapse/dashboard/backend
npm install         # 如 node <20，建议 nvm use 20 后重装依赖
npm run build       # 可选，生成 dist
npm start           # 开发/本地，监听 3001
# 或生产：
# NODE_ENV=production node dist/index.js
```
验证：
```bash
curl -f http://127.0.0.1:3001/health/ready
```
若端口占用报 EADDRINUSE，`ss -ltnp | grep 3001` 找占用进程或暂时改 `PORT=3010`。

## 7. Dashboard 前端 (dashboard/frontend)
配置：`dashboard/frontend/.env`，将 `VITE_API_URL` 指向后端，例如：
```
VITE_API_URL=http://localhost:3001/api/v1
VITE_APP_NAME=Matrix Dashboard
```
启动/构建：
```bash
cd /home/shijian/projects/privchat-synapse/dashboard/frontend
npm install
npm run dev -- --host --port 3000   # 本地预览
# 生产构建
npm run build
```
如需通过 Cloudflare 暴露，可让前端静态文件交给后端或 Nginx，或直接访问后端内置健康页 `/health/dashboard`（若实现）。

## 8. 端到端验证顺序
1) 数据层：`pg_isready`、`redis-cli PING`。  
2) Synapse：`curl http://127.0.0.1:8008/_matrix/client/versions`。  
3) Dashboard API：`curl http://127.0.0.1:3001/health/ready`。  
4) Cloudflare 内网：通过 `curl http://127.0.0.1:3001/health/dashboard`（如有）。  
5) Cloudflare 外网：`curl https://chat.831511.xyz/_matrix/client/versions`，`curl https://admin.chat.831511.xyz/health/ready`。  
6) 客户端登录：Element Web 选择自定义服务器 `https://chat.831511.xyz`，使用已创建管理员/测试账号登录并发消息。

## 9. 常见故障快速处理
- **Redis 认证循环**：统一 Redis 密码配置（见第 2 步），重启 redis + synapse。  
- **端口占用**：`ss -ltnp | grep <port>` 找进程并处理，或暂改端口环境变量。  
- **Cloudflare 1033/522/530**：重新检查 Public Hostnames 是否存在且橙云，隧道在线，SSL 模式 Full (strict)。  
- **DB 连接拒绝**：确认 `pg_hba.conf` 允许 127.0.0.1/md5，密码一致且 postgres 服务在线。  
- **依赖缺失/Node 版本**：按 package.json 要求使用 Node 20；必要时 `nvm install 20 && nvm use 20 && npm ci`。

## 10. 收尾与安全
- 将敏感密钥（JWT/registration_shared_secret/DB 密码）妥善保存，必要时 rotate 并同步到 Synapse + Dashboard 配置。  
- 确认 systemd 服务开机自启：`systemctl enable matrix-synapse cloudflared`，如需为 Dashboard 创建 unit 可参考简易模板。  
- 备份配置：`/etc/matrix-synapse/*.yaml`、`/etc/cloudflared/config.yml`、`dashboard/backend/.env`。
