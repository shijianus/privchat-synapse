# TODO - 内网 Dashboard 验收留项（2025-11-30 14:02）

## 已执行（本轮）
- 后端：`npm run build` 后以 `DASHBOARD_HOST=0.0.0.0 PORT=3001 npm run start:prod` 重启，监听 `0.0.0.0:3001`，`/health/ready` 在 127.0.0.1 与 192.168.210.135 均返回 200。
- 前端：`npm run build` 并重新启动 `npm run preview -- --host 0.0.0.0 --port 5173`，监听 `0.0.0.0:5173`，内网 `http://192.168.210.135:5173` 返回 200。
- 基线：`node -v`=20.19.6；`redis-cli ping`=PONG；`psql -h 127.0.0.1 -U synapse -d synapse -c 'select 1;'`=1；管理员登录 API 成功获取 access/refresh token。

## 未完成/需后续的检查
- `poetry run synapse_homeserver --version` 未执行（当前环境未安装 poetry）；如需请先安装 poetry 或激活对应虚拟环境。
- 代码质量与测试未跑：`npm run lint`/`npm test`（前后端）、`poetry run ruff check .`、`poetry run tox -e py311` 等。
- 若需公网/反代验证（Cloudflare/Nginx）、Element 客户端真实聊天流、Redis 事件监控，需在具备外部访问条件后补测。
- 建议将 backend/frontend 预览进程改为 systemd/pm2 常驻，并按安全策略限制仅内网可访问。
