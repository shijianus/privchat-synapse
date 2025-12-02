# TEST.md - 本地源代码部署测试规则（非 Docker）

## 目标
- 确认本地源代码部署的 Matrix Synapse、Dashboard 后端/前端在同机环境下可正常运行、互通，并具备对外访问准备。
- 在安全前提下复现关键路径，避免使用 Docker，严格基于本机进程与配置。

## 环境与前置
- Node.js 20+（后端/前端均需）；Poetry 已安装；PostgreSQL 与 Redis 本地服务已启动。
- 配置文件：`/etc/matrix-synapse/homeserver.yaml`、`/etc/matrix-synapse/log_config.yaml`、`dashboard/backend/.env`、`dashboard/frontend/.env` 已按最新密钥与域名更新（禁止使用 LOG.md 中的示例密钥）。
- 网络：如需外网验证，先完成 Cloudflare Tunnel 或 Nginx 反向代理配置。
- 数据：使用专用测试账户/房间，避免污染生产数据。
- 公网访问：内网穿透/反代完成后，确保 `https://<domain>/_matrix/client/versions` 与 Dashboard 反代路径可从外部访问且证书有效。

## 基线检查
- `node -v` 输出 20+；`poetry run synapse_homeserver --version` 正常；`psql postgresql://synapse:<pwd>@127.0.0.1:5432/synapse -c 'select 1'`；`redis-cli ping`。
- 安全变量已旋转且与配置一致；文件权限符合要求（如签名密钥 600）。

## 测试步骤（本机进程）
- **Synapse**：使用现有配置启动/重启；健康检查 `curl http://127.0.0.1:8008/_matrix/client/versions`，如已反代/隧道，再从外网地址 `https://<domain>/_matrix/client/versions` 重复一次。
- **Dashboard 后端 (port 3001)**：`cd dashboard/backend && npm ci && npm run build && npm run start:prod`；健康检查 `curl http://127.0.0.1:3001/health/ready` `/health/live`；如需初始化，执行 `npm run db:migrate`、`npm run db:seed`。
- **Dashboard 前端**：`cd dashboard/frontend && npm ci && npm run build`；本地预览 `npm run preview -- --host --port 5173`；浏览器验证 UI -> API（跨域指向 3001 或反代域名）；公网反代后，用浏览器访问实际域名确认 HTML 正常加载。
- **集成验证**：创建/登录测试用户，检查用户列表、封禁、申诉接口能与 Synapse/DB/Redis 协同；验证 Redis 频道 `dashboard.user_events` 收发无误。
- **官方客户端验证**：在公网域名上使用 Matrix 官方客户端（如 Element Web/桌面/移动）注册或登录测试账号，完成双向聊天（含消息、已读回执、房间创建）；必要时在 Dashboard 中观察/管理对应用户行为。
- **Dashboard HTML 直访**：浏览器直接访问后端提供的 HTML（如 `/health/dashboard` 或反代到的管理入口），确认可达且无证书/CORS 问题。

## 质量与回归
- 后端：可选执行 `npm test`（如有测试集）或至少跑 lint：`npm run lint`。
- 前端：可选执行 `npm run lint`，确认构建无警告。
- Python：如修改过 Synapse 侧，执行 `poetry run ruff check .`；必要时 `poetry run tox -e py311`。

## 日志与记录
- 测试命令、时间、结果、异常统一追加到 `LOG.md`，并注明使用的节点/端口/域名。
- 失败用例需包含复现步骤、期望与实际结果、相关日志片段。

## 注意事项
- 全程禁止 Docker 运行路径，避免误用容器配置。
- 不得在测试中使用生产密钥或账户；必要时清理测试数据。
- 配置变更后务必重启相关服务并重新做健康检查。

## 内网部署重点验证

**重要**: 根据用户要求，Dashboard 系统必须在内网环境中完全运行，不需要公网访问暴露。

### 核心测试要求
- ✅ **验证内网访问**: `http://127.0.0.1:3001/health/dashboard` (管理界面)
- ✅ **验证前端访问**: `http://127.0.0.1:5173` (React界面)
- ✅ **验证API功能**: `curl http://127.0.0.1:3001/api/v1/` (API端点)
- ✅ **验证管理员登录**: 使用 matrix.admin@example.com / admin123
- ⚠️ **公网暴露**: Dashboard 不需要暴露到公网，仅限内网访问
- ⚠️ **安全配置**: 确保 Dashboard 仅内网可访问，符合安全要求

### 安全优先级
1. **内网访问**是主要测试目标
2. **公网暴露**不适用于Dashboard
3. **Matrix API**可以通过Cloudflare暴露
4. **Dashboard管理**必须限制在127.0.0.1范围内


## 内网部署重点验证

**重要**: 根据用户要求，Dashboard 系统必须在内网环境中完全运行，不需要公网访问暴露。

### 核心测试要求
- ✅ **验证内网访问**: `http://127.0.0.1:3001/health/dashboard` (管理界面)
- ✅ **验证前端访问**: `http://127.0.0.1:5173` (React界面)
- ✅ **验证API功能**: `curl http://127.0.0.1:3001/api/v1/` (API端点)
- ✅ **验证管理员登录**: 使用 matrix.admin@example.com / admin123

### 安全优先级
1. **内网访问**是主要测试目标
2. **公网暴露**不适用于Dashboard
3. **Matrix API**可以通过Cloudflare暴露
4. **Dashboard管理**必须限制在127.0.0.1范围内

