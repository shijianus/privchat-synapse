# Dashboard Development Report — Internal Monitor & Port Hardening

日期：2025-12-03  
仓库：privchat-synapse

## 本次完成的工作
- **内网绑定与端口统一**：默认监听主机调整为 `127.0.0.1`，后端 `.env.example` 端口统一到 `3001`；前端 Vite 及 Docker/NGINX 现统一使用 `5173`，API 代理指向 `3001`，前端 `.env` 改为本机回环地址。
- **公开监控页面 `/monitor`**：新增 `MonitoringService` + `monitor-routes` + `monitor.html`，按 PRD 第10节展示 CPU/内存/磁盘/网络/GPU、Synapse/Postgres/Redis/MinIO 状态、连接池/Redis 命中率、快速统计（用户/封禁/申诉/注册/在线/消息/活跃房间）、系统信息与最近日志，5 秒自动刷新，纯内网只读。
- **健康检查增强**：`/health` 系列返回实时服务摘要并将旧 `/health/dashboard` 重定向到 `/monitor`，健康与监控接口均无需认证方便运维探活。
- **容器/构建适配**：后端镜像打包时额外拷贝 `public/` 以包含监控静态页；前端 Dockerfile/README 端口与健康检查同步到 5173。

## 影响范围
- 新的监控 API/页面：`http://127.0.0.1:3001/monitor` (HTML) 与 `/monitor/status` (JSON)，并在 `/health/monitor` 保留子路径。
- 后端服务默认仅回环可达，如需容器跨主机访问需显式设置 `DASHBOARD_HOST=0.0.0.0`。
- 前端容器/开发端口变更为 5173，反向代理/端口映射需同步修改。

## 风险与后续
- 监控统计中的 Synapse 消息/在线数依赖数据库表，若目标库未初始化会回退为 `null`；如需精确监控可补充特定视图或轻量索引。
- 构建未执行（本地缺少 TypeScript 二进制，`npm run build` 失败），部署前需在安装依赖后跑一遍 `npm run build`/`npm test`。

---

# Dashboard Development Report — User Provisioning Upgrade

日期：2025-11-30
仓库：privchat-synapse

## 本次完成的工作
- **内网调用 Synapse 创建用户**：新增 `SynapseAdminService`，通过 `SYNAPSE_ADMIN_BASE_URL` + `SYNAPSE_ADMIN_ACCESS_TOKEN` 直接走服务器 API 创建 Matrix 账户，复用服务器端唯一性、黑名单、密码强度策略，并严格限制 server_name 域。
- **后台能力扩展**：`UserService.provisionSynapseUser` 增加黑名单检查、强密码生成/校验、profile upsert、Redis 缓存刷新和审计日志记录；仅超级管理员可用。路由 `POST /api/v1/users/provision` 加权限与角色校验。
- **配置与安全**：env 支持 Synapse 管理端点/默认房间/服务域（env.ts 与 .env.example）；密码生成增加强制复杂度；阻止跨域 server_name。
- **前端体验**：Users 页面为超级管理员提供 Cloudflare 风格分步抽屉（账号信息 → 凭证策略 → 用户组/风控 → 复核 → 成功页），展示“调用服务器 API 创建用户”，成功页可复制 Matrix ID / 一次性密码；角色判定修正避免渲染异常。
- **类型与 API**：前后端新增用户开通请求/响应类型，API 客户端暴露 `provisionUser`。

## 影响范围
- 配置：需要设置 `SYNAPSE_ADMIN_BASE_URL`、`SYNAPSE_ADMIN_ACCESS_TOKEN`、`SYNAPSE_SERVER_NAME`，可选 `SYNAPSE_DEFAULT_ROOMS`。
- 权限：仅 `super_admin` 可见按钮与路由；其它角色无入口无权限。
- 审计：创建行为写入 operation_logs，包含组别/状态/风险/默认房间/欢迎消息/密码策略等元数据。

## 已知待办 / 风险
- 未实现“加入默认房间”“Bot 欢迎/安全提示”后续动作（仅记录意图）；需决定由 Dashboard 还是 Bot/Synapse 侧执行。
- 后台目前未对邮箱/手机号格式做强校验，必要时补充 Joi 规则。
- 未新增自动化测试；本地未运行端到端验证（需配置 Synapse 管理 Token 后执行）。

## 建议的下一步
1) 在部署环境填写上述 Synapse 管理端点与 Token，执行一次 Dashboard 侧创建用户，确认 Synapse 成功落库且 operation_logs 记录完整。  
2) 若需要自动加房/推送欢迎语：实现对应后台任务或 Bot 调用；添加执行结果写审计。  
3) 补充前后端测试用例（provision API、黑名单/弱密码拒绝路径、UI 流程）。  
4) 在文档/运维手册中补充超级管理员创建流程与参数要求，避免误用生产管理员 Token。***
