# Matrix Dashboard 用户开通功能配置与使用指南

## 📋 问题总结

用户反馈已完成用户开通功能的实现，包括：
- 超级管理员专用的用户预配置流程
- Synapse 管理员 API 集成
- 黑名单/密码检查
- 用户配置文件更新
- 操作审计记录
- Cloudflare 风格的多步骤前端界面

**当前状态**: 功能开发完成，需要配置环境变量并进行手动测试验证

## 🔧 环境配置步骤

### 1. 设置必需的环境变量

请编辑 `dashboard/backend/.env` 文件（如果不存在，请基于 `.env.example` 创建）：

```bash
# 必需的 Synapse 管理员配置
SYNAPSE_ADMIN_BASE_URL=http://127.0.0.1:8008/_synapse/admin
SYNAPSE_ADMIN_ACCESS_TOKEN=your_synapse_admin_access_token_here
SYNAPSE_SERVER_NAME=matrix.example.com

# 可选配置（根据实际需求）
SYNAPSE_DEFAULT_ROOMS="#general:matrix.example.com,#random:matrix.example.com"

# 其他 Dashboard 配置（确保已设置）
DATABASE_URL=postgresql://synapse:your_password@127.0.0.1:5432/synapse
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=your_jwt_secret_key_here
```

### 2. 获取 Synapse 管理员访问令牌

#### 方法一：通过 Synapse 配置文件生成

编辑你的 Synapse `homeserver.yaml` 文件：

```yaml
# homeserver.yaml
admin_users:
  - "@your_admin:matrix.example.com"

# 确保管理员功能启用
enable_admin_api: true
```

然后使用管理员账户登录 Matrix 客户端，通过以下命令获取访问令牌：

```bash
# 方法1: 使用 Matrix 客户端获取
# 登录后在客户端设置或开发者工具中找到访问令牌

# 方法2: 使用 curl 直接登录获取
curl -X POST http://127.0.0.1:8008/_matrix/client/r0/login \
  -H "Content-Type: application/json" \
  -d '{
    "type": "m.login.password",
    "user": "@your_admin:matrix.example.com",
    "password": "your_admin_password"
  }'

# 响应中的 access_token 就是管理员访问令牌
```

#### 方法二：使用 Synapse-register-tools 工具

```bash
# 安装 synapse-register-tools
pip install synapse-register-tools

# 生成管理员令牌
register-user -c homeserver.yaml -u your_admin -p your_password -a
```

### 3. 配置服务器名称

确保 `SYNAPSE_SERVER_NAME` 与你的 Synapse 配置中的 `server_name` 一致：

```yaml
# homeserver.yaml
server_name: "matrix.example.com"  # 必须与 SYNAPSE_SERVER_NAME 相同
```

## 🧪 手动测试步骤

### 1. 启动所有必需的服务

```bash
# 启动 Redis（如果未运行）
redis-server

# 启动 PostgreSQL（如果未运行）
sudo systemctl start postgresql

# 启动 Synapse 服务器
poetry run python -m synapse.app.homeserver --config-path homeserver.yaml

# 启动 Dashboard 后端
cd dashboard/backend
npm run dev

# 启动 Dashboard 前端（新终端）
cd dashboard/frontend
npm run dev
```

### 2. 验证服务健康状态

```bash
# 检查 Dashboard 后端健康状态
curl -s http://127.0.0.1:3001/health/ready

# 检查 Synapse 管理员 API 可用性
curl -s -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://127.0.0.1:8008/_synapse/admin/v1/versions

# 检查数据库连接
PGPASSWORD='your_password' psql -h 127.0.0.1 -U synapse -d synapse -c "SELECT 1 as db_test;" -qt

# 检查 Redis 连接
redis-cli ping
```

### 3. 登录 Dashboard 并测试用户开通

#### 步骤 1：访问前端
打开浏览器访问 `http://localhost:3000`，使用超级管理员账户登录

#### 步骤 2：进入用户管理页面
1. 点击侧边栏的 "用户管理" 菜单
2. 页面加载后，超级管理员应该能看到右上角的 "开通新用户" 按钮
3. 点击按钮打开 Cloudflare 风格的多步骤抽屉

#### 步骤 3：填写用户信息（第1步 - 账号信息）
```json
{
  "username": "testuser2025",
  "displayName": "测试用户2025",
  "userGroup": "user",  // 可选: "user", "vip", "moderator", "admin"
  "riskLevel": "low"     // 可选: "low", "medium", "high", "critical"
}
```

#### 步骤 4：配置凭证策略（第2步）
系统将自动生成强密码，你可以：
- 保留自动生成的密码
- 自定义密码策略
- 设置是否启用二级密码

#### 步骤 5：设置用户组和风控（第3步）
- 选择用户组（user/vip/moderator/admin）
- 设置风险等级（low/medium/high/critical）
- 配置默认房间（可选）

#### 步骤 6：复核信息（第4步）
检查所有用户信息，确认无误后点击"确认开通"

#### 步骤 7：成功页面（第5步）
成功后页面将显示：
- Matrix ID: `@testuser2025:matrix.example.com`
- 临时密码: 生成的安全密码
- 操作ID: 审计追踪ID
- 复制按钮用于便捷复制凭证

### 4. 验证用户创建结果

#### 检查 Synapse 数据库
```sql
-- 连接到 Synapse 数据库
PGPASSWORD='your_password' psql -h 127.0.0.1 -U synapse -d synapse

-- 检查用户是否成功创建
SELECT user_id, name, creation_ts, is_guest, admin
FROM users
WHERE user_id = '@testuser2025:matrix.example.com';

-- 检查设备创建记录
SELECT user_id, device_id, display_name, last_seen
FROM devices
WHERE user_id = '@testuser2025:matrix.example.com';
```

#### 检查 Dashboard 数据库
```sql
-- 检查用户配置文件
SELECT user_id, display_name, user_group, risk_level, registration_status, created_at
FROM dashboard.user_profiles
WHERE user_id = '@testuser2025:matrix.example.com';

-- 检查操作审计日志
SELECT operator_id, target_user_id, action_type, action_details, created_at
FROM dashboard.operation_logs
WHERE target_user_id = '@testuser2025:matrix.example.com'
ORDER BY created_at DESC;

-- 检查操作详情
SELECT action_details
FROM dashboard.operation_logs
WHERE target_user_id = '@testuser2025:matrix.example.com'
  AND action_type = 'user_provision';
```

#### 使用 API 验证
```bash
# 1. 获取 Dashboard JWT 令牌（超级管理员登录）
curl -X POST http://127.0.0.1:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_superadmin_username",
    "password": "your_password"
  }'

# 使用返回的 token 进行后续验证

# 2. 验证新创建的用户
curl -X GET http://127.0.0.1:3001/api/v1/users/@testuser2025:matrix.example.com \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. 验证操作日志
curl -X GET "http://127.0.0.1:3001/api/v1/operation-logs?targetUserId=@testuser2025:matrix.example.com" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. 测试新用户登录（使用生成的临时密码）
curl -X POST http://127.0.0.1:8008/_matrix/client/r0/login \
  -H "Content-Type: application/json" \
  -d '{
    "type": "m.login.password",
    "user": "@testuser2025:matrix.example.com",
    "password": "GENERATED_TEMP_PASSWORD"
  }'
```

### 5. 常见问题排查

#### 问题 1：Synapse 管理员 API 连接失败
```bash
# 错误信息示例
"Synapse 用户创建失败: 401 Unauthorized"

# 解决方案
1. 检查 SYNAPSE_ADMIN_ACCESS_TOKEN 是否正确
2. 确认用户在 homeserver.yaml 中配置为管理员
3. 验证 SYNAPSE_ADMIN_BASE_URL 路径是否正确

# 验证管理员 API
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://127.0.0.1:8008/_synapse/admin/v1/users
```

#### 问题 2：数据库连接错误
```bash
# 错误信息示例
"无法连接到数据库"

# 解决方案
1. 检查 DATABASE_URL 格式是否正确
2. 验证 PostgreSQL 服务是否运行
3. 确认数据库用户权限

# 测试数据库连接
PGPASSWORD='your_password' psql -h 127.0.0.1 -U synapse -d synapse -c "SELECT version();"
```

#### 问题 3：Redis 连接失败
```bash
# 错误信息示例
"Redis 连接失败"

# 解决方案
1. 检查 Redis 服务是否运行: `systemctl status redis`
2. 验证 REDIS_URL 格式是否正确
3. 测试 Redis 连接: `redis-cli -u redis://127.0.0.1:6379 ping`
```

#### 问题 4：用户名冲突或黑名单
```bash
# 错误信息示例
"用户名已被注册" 或 "用户名已被屏蔽"

# 解决方案
1. 检查 Synapse 中是否已存在该用户
2. 检查 Dashboard 黑名单表
3. 查看操作日志了解具体失败原因

# 检查黑名单
SELECT username, reason, created_at
FROM dashboard.blacklist
WHERE username = 'problematic_username';
```

## 📊 验证成功指标

### 1. 前端验证
- ✅ 超级管理员能看到"开通新用户"按钮
- ✅ 多步骤抽屉流程正常工作
- ✅ 表单验证和提交功能正常
- ✅ 成功页面显示正确信息（Matrix ID、临时密码等）

### 2. 后端验证
- ✅ API 调用成功，返回 200 状态码
- ✅ Synapse 管理员 API 成功创建用户
- ✅ 数据库记录正确写入
- ✅ 操作审计日志完整记录

### 3. 集成验证
- ✅ 新用户可以使用 Matrix 客户端登录
- ✅ Dashboard 正确显示新创建的用户
- ✅ 用户权限和配置正确设置
- ✅ 缓存正确失效和更新

## 📝 日志检查

### 检查 Dashboard 后端日志
```bash
# 查看用户开通相关的日志
cd dashboard/backend
npm run dev 2>&1 | grep -E "(用户开通|Synapse|provision)"

# 或查看日志文件
tail -f logs/app.log | grep -E "(user_provision|synapse)"
```

### 检查 Synapse 日志
```bash
# 查看 Synapse 用户创建日志
tail -f /var/log/matrix-synapse/homeserver.log | grep -E ("User creation|admin|testuser2025")
```

### 检查数据库操作日志
```sql
-- 查看最近的操作日志
SELECT operator_id, target_user_id, action_type, action_details, created_at
FROM dashboard.operation_logs
WHERE action_type = 'user_provision'
  AND created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 查看用户配置创建
SELECT user_id, display_name, user_group, risk_level, registration_status, created_at
FROM dashboard.user_profiles
WHERE created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## 🚀 下一步建议

### 1. 自动化测试
```bash
# 添加单元测试到 dashboard/backend/src/__tests__/services/user-service.test.ts
npm run test:watch user-service

# 添加前端组件测试
cd dashboard/frontend
npm run test UsersPage
```

### 2. 生产环境配置
```bash
# 创建生产环境配置文件
cp dashboard/backend/.env.example dashboard/backend/.env.production

# 设置生产环境变量（使用安全的密钥）
# SYNAPSE_ADMIN_ACCESS_TOKEN 应该是生产级安全令牌
# JWT_SECRET 应该使用强随机字符串（至少 32 字符）
# DATABASE_URL 应该使用生产数据库连接
```

### 3. 监控和告警
```bash
# 添加健康检查端点监控
# 监控 API 响应时间
# 设置数据库连接池监控
# 配置 Redis 内存使用告警
```

---

**配置完成后，用户开通功能将完全可用。建议在生产环境部署前先在测试环境验证所有功能，并设置适当的监控和日志记录。**