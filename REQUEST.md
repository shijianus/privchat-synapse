# Matrix Dashboard 项目完整设计文档

## 一、项目目标和边界

### 核心目标
为 Synapse Matrix 服务器构建一个**独立的管理 Dashboard 系统**，实现：

1. **用户风控管理**：禁言、软封禁、硬封禁、软删除（四级风控体系）
2. **用户注册管理**：邮箱/手机号验证、人机验证、管理员审核
3. **用户组管理**：不同用户组的存储配额和功能限制
4. **媒体存储管理**：文件去重、冷却期删除、MinIO 集成
5. **申诉系统**：通过 Bot 收集申诉、管理员处理、结果反馈
6. **审计日志**：所有管理操作的完整记录

### 关键约束
- ✅ **不破坏 Synapse 核心功能**：E2EE、联邦、基础聊天必须保持原样
- ✅ **最小化改动 Synapse**：只在必要的检查点插入风控逻辑
- ✅ **内网部署**：所有服务运行在 127.0.0.1，不对外暴露
- ✅ **数据一致性优先**：使用共享数据库 + Redis 缓存失效机制

### 非目标（Phase 1 不做）
- ❌ 移动端客户端定制（先做 Web）
- ❌ 联邦服务器之间的风控同步
- ❌ AI 内容审核（手动审核优先）
- ❌ 支付/订阅系统（用户组手动分配）

---

## 二、整体架构设计

### 系统拓扑图

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL (共享数据库)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Synapse Schema: users, rooms, events, media          │   │
│  │ Dashboard Schema: user_bans, appeals, operation_logs │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────┬───────────────────┘
             │ 读写                       │ 读写
┌────────────▼──────────┐    ┌───────────▼───────────────┐
│  Synapse (执行者)     │    │  Dashboard (管理者)       │
│  ┌─────────────────┐  │    │  ┌──────────────────────┐ │
│  │认证检查点       │  │    │  │HTTP API (Node.js)    │ │
│  │消息发送检查点   │  │    │  │- /api/v1/users       │ │
│  │文件上传检查点   │  │    │  │- /api/v1/bans        │ │
│  │本地缓存(Redis)  │  │    │  │- /api/v1/appeals     │ │
│  └─────────────────┘  │    │  │- /api/v1/media       │ │
│                       │    │  └──────────────────────┘ │
│  ┌─────────────────┐  │    │  ┌──────────────────────┐ │
│  │Pub/Sub订阅者    │  │    │  │Pub/Sub发布者         │ │
│  └─────────────────┘  │    │  └──────────────────────┘ │
└───────────┬───────────┘    └────────────┬──────────────┘
            │                             │
            └──────────┬──────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │  Redis (消息总线+缓存)    │
         │  - Pub/Sub: user.banned   │
         │  - Cache: user:*:routing  │
         └───────────────────────────┘
                       ↑
         ┌─────────────┴─────────────┐
         │  Matrix Bot (申诉助手)    │
         │  - 收集申诉信息           │
         │  - 查询Dashboard API      │
         │  - 发送结果给用户         │
         └───────────────────────────┘
```

### 数据流向

**风控操作流程：**
```
管理员在Dashboard封禁用户Alice
  ↓
Dashboard修改数据库(INSERT INTO user_bans)
  ↓
Dashboard删除Redis缓存(redis.delete("user:alice:routing"))
  ↓
Dashboard发布事件(redis.publish("user.banned", {...}))
  ↓
Synapse订阅者接收事件，删除本地缓存
  ↓
Alice下次登录时，Synapse查询数据库获取最新状态
  ↓
Synapse拒绝登录并断开所有现有连接
```

**消息发送流程：**
```
用户Bob在房间发送消息
  ↓
Synapse检查缓存(user:bob:routing)
  ↓
缓存命中：Bob未被封禁，继续
  ↓
Synapse获取房间成员列表
  ↓
批量查询所有成员状态(Redis MGET)
  ↓
过滤掉被硬封禁的成员
  ↓
只向活跃成员推送消息
```

---

## 三、数据库设计

### Schema 分离策略

**问题：Synapse 和 Dashboard 如何共用数据库？**

**最佳方案：使用 PostgreSQL Schema 分离**

```sql
-- Synapse 使用默认的 public schema
CREATE SCHEMA IF NOT EXISTS public;
-- Synapse的所有表都在这里：users, rooms, events 等

-- Dashboard 使用独立的 dashboard schema
CREATE SCHEMA IF NOT EXISTS dashboard;
-- Dashboard的所有表都在这里
```

**优点：**
- ✅ 逻辑分离清晰，不会混淆
- ✅ 权限控制方便（Synapse 只读 dashboard schema）
- ✅ 迁移和备份独立
- ✅ 便于未来拆分为独立数据库

---

### 完整的表结构设计

#### 1. Dashboard Schema 核心表

```sql
-- ============================================
-- Dashboard Schema
-- ============================================
CREATE SCHEMA IF NOT EXISTS dashboard;

-- --------------------------------------------
-- 用户扩展信息表
-- 存储 Dashboard 特有的用户数据
-- --------------------------------------------
CREATE TABLE dashboard.user_profiles (
  id SERIAL PRIMARY KEY,
  synapse_user_id VARCHAR(255) UNIQUE NOT NULL, -- 关联Synapse的用户ID
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  email_verified BOOLEAN DEFAULT FALSE,
  phone VARCHAR(20),
  phone_verified BOOLEAN DEFAULT FALSE,
  user_group VARCHAR(50) DEFAULT 'free', -- free/normal/premium/enterprise
  registration_status VARCHAR(50) DEFAULT 'pending', -- pending/verified/approved/rejected
  registration_ip VARCHAR(45),
  device_fingerprint VARCHAR(255),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  INDEX idx_email (email),
  INDEX idx_username (username),
  INDEX idx_synapse_user_id (synapse_user_id)
);

-- --------------------------------------------
-- 风控记录表
-- 存储所有封禁、禁言记录（包括历史）
-- --------------------------------------------
CREATE TABLE dashboard.user_bans (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  ban_type VARCHAR(50) NOT NULL, -- 'silence'/'soft_ban'/'hard_ban'/'soft_delete'
  reason TEXT,
  violation_level VARCHAR(50), -- 'minor'/'normal'/'severe'
  violation_count INT DEFAULT 1,
  start_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP, -- NULL表示永久
  status VARCHAR(50) DEFAULT 'active', -- active/lifted/appealed
  created_by VARCHAR(255), -- 管理员ID
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  INDEX idx_user_active_bans (user_id, status, expires_at)
);

-- --------------------------------------------
-- 申诉记录表
-- --------------------------------------------
CREATE TABLE dashboard.appeals (
  id SERIAL PRIMARY KEY,
  ban_id INT NOT NULL,
  user_id INT NOT NULL,
  appeal_type VARCHAR(50), -- 'bot'/'email'
  contact_email VARCHAR(255),
  appeal_reason TEXT NOT NULL,
  incident_description TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending/approved/rejected
  admin_response TEXT,
  admin_id VARCHAR(255),
  appeal_count INT DEFAULT 1, -- 第几次申诉
  created_at TIMESTAMP DEFAULT now(),
  decided_at TIMESTAMP,
  
  FOREIGN KEY (ban_id) REFERENCES dashboard.user_bans(id),
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  INDEX idx_pending_appeals (status, created_at)
);

-- --------------------------------------------
-- 注册黑名单表
-- --------------------------------------------
CREATE TABLE dashboard.registration_blacklist (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL, -- 'username'/'email'/'phone'/'ip'/'device_fingerprint'
  value VARCHAR(255) NOT NULL,
  reason VARCHAR(255),
  banned_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP, -- NULL表示永久
  created_by VARCHAR(255),
  
  UNIQUE (type, value),
  INDEX idx_blacklist_lookup (type, value)
);

-- --------------------------------------------
-- 用户组配置表
-- --------------------------------------------
CREATE TABLE dashboard.user_groups (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(100) UNIQUE NOT NULL,
  storage_limit_mb INT, -- 存储配额
  msg_rate_limit INT, -- 消息/分钟
  ocr_daily_limit INT,
  pdf_daily_limit INT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 插入默认用户组
INSERT INTO dashboard.user_groups (group_name, storage_limit_mb, msg_rate_limit, ocr_daily_limit, pdf_daily_limit) VALUES
  ('free', 100, 10, 10, 10),
  ('normal', 1024, 30, 50, 50),
  ('premium', 10240, 100, 200, 200),
  ('enterprise', NULL, NULL, NULL, NULL);

-- --------------------------------------------
-- 媒体元数据表
-- --------------------------------------------
CREATE TABLE dashboard.media_metadata (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(255),
  event_id VARCHAR(255),
  user_id INT,
  content_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA256
  size_bytes BIGINT,
  mimetype VARCHAR(100),
  stored_on_server BOOLEAN DEFAULT FALSE,
  server_url TEXT,
  thumbnail_url TEXT,
  metadata JSONB, -- 额外信息
  uploaded_at TIMESTAMP DEFAULT now(),
  last_accessed_at TIMESTAMP,
  cooldown_expires_at TIMESTAMP, -- 冷却期结束时间
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  INDEX idx_content_hash (content_hash),
  INDEX idx_cooldown (cooldown_expires_at)
);

-- --------------------------------------------
-- 存储策略表
-- --------------------------------------------
CREATE TABLE dashboard.storage_policies (
  id SERIAL PRIMARY KEY,
  scope_type VARCHAR(50) NOT NULL, -- 'global'/'room'/'user'
  scope_id VARCHAR(255), -- NULL表示全局
  policy JSONB NOT NULL, -- 策略详情
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE (scope_type, scope_id)
);

-- 插入默认全局策略
INSERT INTO dashboard.storage_policies (scope_type, scope_id, policy) VALUES
  ('global', NULL, '{"text": "server", "thumbnail": "server", "media": "client_priority"}');

-- --------------------------------------------
-- 操作日志表
-- --------------------------------------------
CREATE TABLE dashboard.operation_logs (
  id SERIAL PRIMARY KEY,
  operator_id VARCHAR(255) NOT NULL, -- 管理员ID
  action VARCHAR(255) NOT NULL, -- 'ban_user'/'approve_registration'/'lift_ban'
  target_user_id INT,
  details JSONB, -- 操作详情
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT now(),
  
  INDEX idx_operator (operator_id, created_at),
  INDEX idx_target (target_user_id, created_at)
);

-- --------------------------------------------
-- 2FA 配置表
-- --------------------------------------------
CREATE TABLE dashboard.user_2fa_settings (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  secondary_password_hash VARCHAR(255), -- bcrypt hash
  totp_secret VARCHAR(255), -- Base32编码的TOTP密钥
  totp_enabled BOOLEAN DEFAULT FALSE,
  email_2fa_enabled BOOLEAN DEFAULT FALSE,
  phone_2fa_enabled BOOLEAN DEFAULT FALSE,
  safety_codes TEXT[], -- 10个安全码
  recovery_key_encrypted TEXT, -- 加密的Recovery Key
  trusted_device_ids TEXT[],
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id)
);

-- --------------------------------------------
-- 设备注册表
-- --------------------------------------------
CREATE TABLE dashboard.user_devices (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  device_name VARCHAR(255),
  is_trusted BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMP DEFAULT now(),
  last_ip VARCHAR(45),
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  UNIQUE (user_id, device_id),
  INDEX idx_user_devices (user_id, is_trusted)
);

-- --------------------------------------------
-- 硬封禁期间的待发消息表
-- --------------------------------------------
CREATE TABLE dashboard.pending_messages (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  room_id VARCHAR(255) NOT NULL,
  sender_id INT NOT NULL,
  content TEXT,
  event_type VARCHAR(50),
  media_hash VARCHAR(64),
  received_at TIMESTAMP DEFAULT now(),
  synced BOOLEAN DEFAULT FALSE,
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  INDEX idx_user_pending (user_id, synced, received_at)
);
```

---

### 关于 Synapse 表的关联

**关键问题：Dashboard 如何关联 Synapse 的用户？**

Synapse 的用户 ID 格式是 `@username:domain`（比如 `@alice:example.com`）。

**方案：**
1. Dashboard 的 `user_profiles.synapse_user_id` 存储完整的 Matrix ID
2. 当 Synapse 需要检查用户状态时，使用这个 ID 查询

```python
# Synapse 中的查询
def check_user_ban_status(matrix_user_id):
    result = db.query("""
        SELECT ub.* 
        FROM dashboard.user_bans ub
        JOIN dashboard.user_profiles up ON ub.user_id = up.id
        WHERE up.synapse_user_id = ? 
          AND ub.status = 'active'
          AND (ub.expires_at IS NULL OR ub.expires_at > now())
    """, matrix_user_id)
    return result
```

---

## 四、技术栈和依赖

### Dashboard 后端
- **语言**：Node.js 20+ (TypeScript)
- **框架**：Express.js 4.x
- **数据库**：PostgreSQL 15+（使用 `pg` 库）
- **缓存/消息总线**：Redis 7+（使用 `ioredis` 库）
- **认证**：JWT（使用 `jsonwebtoken`）
- **邮件**：Brevo API（使用 `@getbrevo/brevo`）
- **对象存储**：MinIO（使用 `minio` 库）
- **人机验证**：Cloudflare Turnstile

### Dashboard 前端
- **框架**：React 18+ (TypeScript)
- **构建工具**：Vite 5
- **UI 库**：shadcn/ui + Tailwind CSS
- **状态管理**：TanStack Query (React Query)
- **路由**：React Router 6

### Synapse 修改
- **语言**：Python 3.11+
- **异步框架**：Twisted
- **Redis 客户端**：`redis-py`
- **数据库**：`psycopg2`（PostgreSQL）

### 基础设施
- **容器化**：Docker + Docker Compose（开发环境）
- **反向代理**：Nginx（生产环境）

---

## 五、实现路线图

### Phase 1：基础设施 (Week 1-2)

#### 1.1 环境搭建
```bash
# 创建项目目录
mkdir matrix-admin-system
cd matrix-admin-system

# 初始化 Dashboard
mkdir dashboard
cd dashboard
npm init -y
npm install express typescript @types/node @types/express
npm install pg ioredis jsonwebtoken bcrypt
npm install -D nodemon ts-node

# 初始化 Synapse 分支
cd ..
git clone https://github.com/element-hq/synapse.git synapse-custom
cd synapse-custom
git checkout -b feature/dashboard-integration
```

#### 1.2 Docker Compose 本地开发环境
```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: synapse
      POSTGRES_USER: synapse
      POSTGRES_PASSWORD: synapse_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

  minio:
    image: minio/minio
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

#### 1.3 数据库初始化
```bash
# 启动 PostgreSQL
docker-compose up -d postgres

# 执行迁移脚本
psql -h localhost -U synapse -d synapse -f migrations/001_create_dashboard_schema.sql
```

**验收标准：**
- ✅ PostgreSQL、Redis、MinIO 正常运行
- ✅ Dashboard schema 和所有表创建成功
- ✅ 可以通过 `psql` 查询表结构

---

### Phase 2：Dashboard 核心 API (Week 3-4)

#### 2.1 项目结构搭建
```typescript
// dashboard/src/config/database.ts
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'synapse',
  password: process.env.DB_PASSWORD || 'synapse_password',
  database: process.env.DB_NAME || 'synapse',
});

// dashboard/src/config/redis.ts
import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

export const redisPub = new Redis(); // 发布者
export const redisSub = new Redis(); // 订阅者
```

#### 2.2 核心服务实现

**用户封禁服务**
```typescript
// dashboard/src/services/ban-service.ts
import { pool } from '../config/database';
import { redis, redisPub } from '../config/redis';

export class BanService {
  async banUser(userId: number, banType: 'silence' | 'soft_ban' | 'hard_ban', options: {
    reason: string;
    durationHours?: number;
    violationLevel: string;
    adminId: string;
  }) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. 插入封禁记录
      const expiresAt = options.durationHours 
        ? new Date(Date.now() + options.durationHours * 3600 * 1000)
        : null;
      
      const result = await client.query(`
        INSERT INTO dashboard.user_bans 
        (user_id, ban_type, reason, violation_level, expires_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [userId, banType, options.reason, options.violationLevel, expiresAt, options.adminId]);
      
      await client.query('COMMIT');
      
      // 2. 立即删除缓存
      await redis.del(`user:${userId}:routing`);
      
      // 3. 发布 Pub/Sub 事件
      await redisPub.publish('user.banned', JSON.stringify({
        user_id: userId,
        ban_type: banType,
        expires_at: expiresAt,
        timestamp: new Date().toISOString()
      }));
      
      // 4. 如果是硬封禁，额外发布断开连接事件
      if (banType === 'hard_ban') {
        await redisPub.publish('user.force_disconnect', JSON.stringify({
          user_id: userId,
          reason: 'Hard Banned'
        }));
      }
      
      return result.rows[0].id;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async liftBan(banId: number, adminId: string) {
    // 类似逻辑：更新数据库 → 删除缓存 → 发布事件
  }
}
```

#### 2.3 HTTP API 路由
```typescript
// dashboard/src/routes/bans.ts
import express from 'express';
import { BanService } from '../services/ban-service';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
const banService = new BanService();

router.post('/bans', authMiddleware, async (req, res) => {
  try {
    const { userId, banType, reason, durationHours, violationLevel } = req.body;
    
    const banId = await banService.banUser(userId, banType, {
      reason,
      durationHours,
      violationLevel,
      adminId: req.user.id
    });
    
    res.json({ success: true, banId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

**验收标准：**
- ✅ 可以通过 API 封禁用户
- ✅ 数据库正确插入记录
- ✅ Redis 缓存被清除
- ✅ Pub/Sub 事件被发布（用 redis-cli 验证）

---

### Phase 3：Synapse 集成 (Week 5-6)

#### 3.1 确定 Synapse 改动点

**需要修改的文件（预估）：**
1. `synapse/handlers/auth.py` - 登录认证检查
2. `synapse/handlers/message.py` - 消息发送检查
3. `synapse/handlers/room.py` - 房间操作检查
4. `synapse/rest/media/v1/upload_resource.py` - 文件上传检查

#### 3.2 实现缓存和 Pub/Sub 订阅

**在 Synapse 中新增模块**
```python
# synapse/dashboard_integration/__init__.py
from typing import Optional, Dict, Any
import redis
import json
import threading

class DashboardIntegration:
    def __init__(self, config):
        self.redis_client = redis.Redis(
            host=config.redis_host,
            port=config.redis_port,
            decode_responses=True
        )
        self.pubsub = self.redis_client.pubsub()
        
        # 启动订阅线程
        self.pubsub.subscribe('user.banned', 'user.unbanned', 'user.force_disconnect')
        self.subscriber_thread = threading.Thread(target=self._listen_events)
        self.subscriber_thread.daemon = True
        self.subscriber_thread.start()
    
    def _listen_events(self):
        for message in self.pubsub.listen():
            if message['type'] == 'message':
                self._handle_event(message['channel'], message['data'])
    
    def _handle_event(self, channel: str, data: str):
        event = json.loads(data)
        user_id = event['user_id']
        
        if channel == 'user.banned':
            # 清除本地缓存
            self.redis_client.delete(f"user:{user_id}:routing")
            
        elif channel == 'user.force_disconnect':
            # 断开用户所有连接
            self._terminate_user_sessions(user_id)
    
    def get_user_routing_state(self, user_id: str) -> Optional[Dict[str, Any]]:
        # 尝试从缓存读取
        cached = self.redis_client.get(f"user:{user_id}:routing")
        if cached:
            return json.loads(cached)
        
        # 缓存未命中，查询数据库
        # （这里需要访问 PostgreSQL）
        return self._load_from_db(user_id)
    
    def _load_from_db(self, user_id: str) -> Dict[str, Any]:
        # 查询逻辑...
        pass
```

#### 3.3 在认证点插入检查

```python
# synapse/handlers/auth.py
from synapse.dashboard_integration import DashboardIntegration

class AuthHandler:
    def __init__(self, hs):
        # ... 原有初始化 ...
        self.dashboard = DashboardIntegration(hs.config.dashboard)
    
    async def check_password(self, user_id: str, password: str):
        # 原有的密码验证逻辑
        if not self._verify_password(user_id, password):
            raise AuthError("Invalid password")
        
        # 新增：Dashboard 风控检查
        user_state = self.dashboard.get_user_routing_state(user_id)
        if user_state and user_state.get('is_hard_banned'):
            raise AuthError("Account not found")  # 注意：不显示"已封禁"
        
        return True
```

**验收标准：**
- ✅ 被封禁用户无法登录
- ✅ Synapse 正确订阅 Redis Pub/Sub 事件
- ✅ 缓存失效机制工作正常
- ✅ 硬封禁用户的连接被立即断开

---

### Phase 4：Bot 和申诉系统 (Week 7-8)

#### 4.1 创建 Bot 账户
```bash
# 在 Synapse 中创建 Bot 用户
curl -X POST http://localhost:8008/_synapse/admin/v2/users/@admin_bot:example.com \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"password": "bot_password", "admin": false}'
```

#### 4.2 Bot 服务实现
```typescript
// bot/src/index.ts
import * as sdk from 'matrix-js-sdk';
import axios from 'axios';

class AdminBot {
  private client: sdk.MatrixClient;
  private dashboardApiUrl = 'http://localhost:3000/api/v1';
  
  async start() {
    this.client = sdk.createClient({
      baseUrl: 'http://localhost:8008',
      accessToken: process.env.BOT_ACCESS_TOKEN,
      userId: '@admin_bot:example.com'
    });
    
    this.client.on('Room.timeline', this.handleMessage.bind(this));
    await this.client.startClient();
  }
  
  async handleMessage(event: any) {
    if (event.getType() !== 'm.room.message') return;
    if (event.getSender() === this.client.getUserId()) return;
    
    const content = event.getContent();
    const message = content.body;
    
    if (message.startsWith('/appeal')) {
      await this.handleAppeal(event);
    } else if (message.startsWith('/verify')) {
      await this.handleVerify(event);
    }
  }
  
  async handleAppeal(event: any) {
    const sender = event.getSender();
    const roomId = event.getRoomId();
    
    // 引导用户填写申诉信息
    await this.client.sendTextMessage(roomId, 
      '请提供以下信息：\n1. 您的联系邮箱\n2. 申诉原因\n3. 事情经过'
    );
    
    // 收集信息后，提交到 Dashboard API
    const appealData = await this.collectAppealInfo(sender, roomId);
    
    // 提交申诉到 Dashboard
    try {
      const response = await axios.post(`${this.dashboardApiUrl}/appeals`, {
        userId: sender,
        ...appealData
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.BOT_API_TOKEN}`
        }
      });
      
      await this.client.sendTextMessage(roomId,
        '您的申诉已提交（编号：' + response.data.appealId + '），管理员会在24小时内处理。'
      );
    } catch (error) {
      await this.client.sendTextMessage(roomId,
        '申诉提交失败，请稍后重试或发送邮件至 support@example.com'
      );
    }
  }
  
  async handleVerify(event: any) {
    // 好友担保验证逻辑
    const sender = event.getSender();
    const message = event.getContent().body;
    const parts = message.split(' ');
    
    if (parts.length !== 3) {
      await this.client.sendTextMessage(event.getRoomId(),
        '格式错误。正确格式：/verify @username:domain hash_code'
      );
      return;
    }
    
    const targetUser = parts[1];
    const hashCode = parts[2];
    
    // 验证好友关系和时间
    try {
      const response = await axios.post(`${this.dashboardApiUrl}/2fa/friend-verify`, {
        verifier: sender,
        target: targetUser,
        hash: hashCode
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.BOT_API_TOKEN}`
        }
      });
      
      if (response.data.success) {
        await this.client.sendTextMessage(event.getRoomId(),
          '验证成功！您的好友已可以登录。'
        );
      } else {
        await this.client.sendTextMessage(event.getRoomId(),
          '验证失败：' + response.data.reason
        );
      }
    } catch (error) {
      await this.client.sendTextMessage(event.getRoomId(),
        '验证失败，请检查您是否有权限进行此操作。'
      );
    }
  }
  
  async collectAppealInfo(sender: string, roomId: string): Promise<any> {
    // 使用状态机收集信息
    // 这里简化示例，实际需要实现多轮对话
    return {
      email: 'user@example.com',
      reason: '我认为封禁是误判',
      description: '详细经过...'
    };
  }
}

// 启动 Bot
const bot = new AdminBot();
bot.start().catch(console.error);
```

#### 4.3 Dashboard 申诉管理 API

```typescript
// dashboard/src/routes/appeals.ts
import express from 'express';
import { pool } from '../config/database';
import { redisPub } from '../config/redis';

const router = express.Router();

// Bot 提交申诉
router.post('/appeals', async (req, res) => {
  const { userId, email, reason, description } = req.body;
  
  try {
    // 查询用户的封禁记录
    const banResult = await pool.query(`
      SELECT ub.id, ub.ban_type, up.synapse_user_id
      FROM dashboard.user_bans ub
      JOIN dashboard.user_profiles up ON ub.user_id = up.id
      WHERE up.synapse_user_id = $1 AND ub.status = 'active'
      ORDER BY ub.created_at DESC
      LIMIT 1
    `, [userId]);
    
    if (banResult.rows.length === 0) {
      return res.status(404).json({ error: '未找到封禁记录' });
    }
    
    const ban = banResult.rows[0];
    
    // 检查申诉次数
    const appealCountResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM dashboard.appeals
      WHERE ban_id = $1
    `, [ban.id]);
    
    const appealCount = parseInt(appealCountResult.rows[0].count) + 1;
    
    // 插入申诉记录
    const result = await pool.query(`
      INSERT INTO dashboard.appeals 
      (ban_id, user_id, appeal_type, contact_email, appeal_reason, incident_description, appeal_count)
      VALUES ($1, (SELECT id FROM dashboard.user_profiles WHERE synapse_user_id = $2), 'bot', $3, $4, $5, $6)
      RETURNING id
    `, [ban.id, userId, email, reason, description, appealCount]);
    
    res.json({ 
      success: true, 
      appealId: result.rows[0].id,
      appealCount 
    });
  } catch (error) {
    console.error('申诉提交失败:', error);
    res.status(500).json({ error: '提交失败' });
  }
});

// 管理员处理申诉
router.post('/appeals/:id/decide', async (req, res) => {
  const appealId = req.params.id;
  const { decision, response, adminId } = req.body; // decision: 'approve'/'reject'
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 更新申诉状态
    await client.query(`
      UPDATE dashboard.appeals
      SET status = $1, admin_response = $2, admin_id = $3, decided_at = now()
      WHERE id = $4
    `, [decision === 'approve' ? 'approved' : 'rejected', response, adminId, appealId]);
    
    // 如果批准申诉，需要解封用户
    if (decision === 'approve') {
      const appealInfo = await client.query(`
        SELECT ban_id, user_id FROM dashboard.appeals WHERE id = $1
      `, [appealId]);
      
      const banId = appealInfo.rows[0].ban_id;
      const userId = appealInfo.rows[0].user_id;
      
      // 更新封禁状态
      await client.query(`
        UPDATE dashboard.user_bans
        SET status = 'lifted'
        WHERE id = $1
      `, [banId]);
      
      // 获取 synapse_user_id
      const userInfo = await client.query(`
        SELECT synapse_user_id FROM dashboard.user_profiles WHERE id = $1
      `, [userId]);
      
      const synapseUserId = userInfo.rows[0].synapse_user_id;
      
      // 清除缓存
      await client.query(`SELECT pg_notify('cache_invalidate', $1)`, [synapseUserId]);
      
      // 发布解封事件
      await redisPub.publish('user.unbanned', JSON.stringify({
        user_id: synapseUserId,
        timestamp: new Date().toISOString()
      }));
    }
    
    await client.query('COMMIT');
    
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('申诉处理失败:', error);
    res.status(500).json({ error: '处理失败' });
  } finally {
    client.release();
  }
});

export default router;
```

**验收标准：**
- ✅ 用户可以通过 Bot 提交申诉
- ✅ 申诉信息正确保存到数据库
- ✅ 管理员可以在 Dashboard 查看并处理申诉
- ✅ 申诉通过后，用户解封且可以登录

---

### Phase 5：前端 Dashboard UI (Week 9-10)

#### 5.1 项目结构

```
dashboard/frontend/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── users/
│   │   │   ├── UserList.tsx
│   │   │   ├── UserDetail.tsx
│   │   │   └── BanUserModal.tsx
│   │   ├── appeals/
│   │   │   ├── AppealList.tsx
│   │   │   └── AppealDetail.tsx
│   │   └── media/
│   │       └── MediaBrowser.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Users.tsx
│   │   ├── Appeals.tsx
│   │   ├── Media.tsx
│   │   └── Logs.tsx
│   ├── services/
│   │   └── api.ts
│   ├── App.tsx
│   └── main.tsx
└── package.json
```

#### 5.2 核心组件示例

```typescript
// src/pages/Users.tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { UserList } from '../components/users/UserList';
import { BanUserModal } from '../components/users/BanUserModal';
import { api } from '../services/api';

export function UsersPage() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [showBanModal, setShowBanModal] = useState(false);
  
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users')
  });
  
  const banMutation = useMutation({
    mutationFn: (data) => api.post('/bans', data),
    onSuccess: () => {
      setShowBanModal(false);
      // 刷新用户列表
    }
  });
  
  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">用户管理</h1>
        <button className="btn-primary">导出报告</button>
      </div>
      
      <UserList 
        users={users}
        onBanUser={(user) => {
          setSelectedUser(user);
          setShowBanModal(true);
        }}
      />
      
      {showBanModal && (
        <BanUserModal
          user={selectedUser}
          onConfirm={(banData) => banMutation.mutate(banData)}
          onClose={() => setShowBanModal(false)}
        />
      )}
    </div>
  );
}
```

```typescript
// src/components/users/BanUserModal.tsx
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function BanUserModal({ user, onConfirm, onClose }) {
  const [banType, setBanType] = useState('silence');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState(24);
  
  const handleSubmit = () => {
    onConfirm({
      userId: user.id,
      banType,
      reason,
      durationHours: duration,
      violationLevel: 'normal'
    });
  };
  
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">
          封禁用户：{user.username}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block mb-2">封禁类型</label>
            <select 
              value={banType} 
              onChange={(e) => setBanType(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="silence">禁言</option>
              <option value="soft_ban">软封禁</option>
              <option value="hard_ban">硬封禁</option>
            </select>
          </div>
          
          <div>
            <label className="block mb-2">时长（小时）</label>
            <input 
              type="number" 
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block mb-2">原因</label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows={4}
            />
          </div>
          
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSubmit} className="bg-red-600">
              确认封禁
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
```

**验收标准：**
- ✅ 管理员可以登录 Dashboard
- ✅ 可以查看用户列表和详情
- ✅ 可以对用户进行封禁操作
- ✅ 可以查看和处理申诉
- ✅ 所有操作记录到审计日志

---

### Phase 6：客户端定制 (Week 11-12)

#### 6.1 Fork Element Web

```bash
git clone https://github.com/element-hq/element-web.git element-web-custom
cd element-web-custom
git checkout -b feature/dashboard-integration
npm install
```

#### 6.2 2FA 登录流程修改

**修改位置：** `src/components/structures/auth/Login.tsx`

```typescript
// src/components/structures/auth/Login.tsx
async function handleLogin(username: string, password: string) {
  try {
    // Step 1: 正常登录
    const loginResponse = await matrixClient.login('m.login.password', {
      user: username,
      password: password
    });
    
    // Step 2: 检查是否需要 2FA
    const userInfo = await fetch(`${dashboardApiUrl}/users/${username}/2fa-status`, {
      headers: {
        'Authorization': `Bearer ${loginResponse.access_token}`
      }
    });
    
    const { requires2FA } = await userInfo.json();
    
    if (requires2FA) {
      // Step 3: 显示 2FA 输入界面
      setShow2FAModal(true);
      setPendingLogin(loginResponse);
    } else {
      // 直接完成登录
      completeLogin(loginResponse);
    }
  } catch (error) {
    showError(error.message);
  }
}

async function verify2FA(method: string, code: string) {
  try {
    const response = await fetch(`${dashboardApiUrl}/auth/verify-2fa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pendingLogin.access_token}`
      },
      body: JSON.stringify({
        method, // 'email'/'totp'/'safety_code'
        code
      })
    });
    
    if (response.ok) {
      completeLogin(pendingLogin);
    } else {
      showError('验证失败');
    }
  } catch (error) {
    showError(error.message);
  }
}
```

#### 6.3 注册流程修改

**新增注册页面**

```typescript
// src/components/structures/auth/Registration.tsx
export function CustomRegistration() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [turnstileToken, setTurnstileToken] = useState('');
  
  async function handleSubmit() {
    // Step 1: 人机验证
    if (!turnstileToken) {
      showError('请完成人机验证');
      return;
    }
    
    // Step 2: 提交注册申请
    try {
      const response = await fetch(`${dashboardApiUrl}/registration/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          turnstileToken,
          deviceFingerprint: getDeviceFingerprint()
        })
      });
      
      const result = await response.json();
      
      if (result.requiresVerification) {
        // 需要邮箱验证
        setStep(2);
      } else if (result.requiresApproval) {
        // 需要管理员审核
        showMessage('您的申请已提交，请等待管理员审核');
      }
    } catch (error) {
      showError(error.message);
    }
  }
  
  return (
    <div className="registration-container">
      {step === 1 && (
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            placeholder="用户名"
            value={formData.username}
            onChange={(e) => setFormData({...formData, username: e.target.value})}
          />
          <input 
            type="email" 
            placeholder="邮箱"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />
          {/* 其他字段... */}
          
          <Turnstile 
            siteKey={process.env.TURNSTILE_SITE_KEY}
            onVerify={setTurnstileToken}
          />
          
          <button type="submit">提交注册</button>
        </form>
      )}
      
      {step === 2 && (
        <div>
          <p>验证码已发送至 {formData.email}</p>
          <input 
            type="text" 
            placeholder="验证码"
            onChange={(e) => verifyCode(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
```

**验收标准：**
- ✅ 用户可以通过定制客户端注册
- ✅ 注册时进行人机验证
- ✅ 邮箱验证码正常发送和验证
- ✅ 登录时 2FA 流程正常工作
- ✅ 被封禁用户无法登录

---

## 六、我还存在的问题

现在整个项目框架已经清晰，但还有一些需要你决策的细节问题：

### 关键决策点

**1. 关于 Synapse 用户表的扩展方式**
- **选项 A**：Dashboard 创建 `user_profiles` 表，通过 `synapse_user_id` 外键关联 Synapse 的 `users` 表
- **选项 B**：直接在 Synapse 的 `users` 表中添加新列（user_group、registration_status 等）
- **选项 C**：使用 PostgreSQL 的 VIEW 来统一查询

**我的建议：选项 A**（独立表 + 外键），理由是：
- ✅ 不破坏 Synapse 的表结构
- ✅ 便于未来迁移
- ✅ 权限隔离清晰

你同意吗？

---

**2. 关于设备指纹的实现**

设备指纹需要在客户端生成。你想用哪种方式？
- **选项 A**：使用现成的库（如 FingerprintJS）
- **选项 B**：自己实现（基于 User-Agent + Canvas + WebGL）
- **选项 C**：简化为只记录 User-Agent + IP

**我的建议：选项 A**（使用 FingerprintJS），因为它更可靠。

---

**3. 关于媒体存储的冷却期机制**

你之前提到"冷却期过了后就删除，如果存在相同哈希值的文件再次传输，则重置冷却期"。

**问题：** 这个冷却期的默认时长应该是多久？
- 24 小时？
- 7 天？
- 30 天？

不同的用户组是否有不同的冷却期？

**我的建议：**
- 免费组：7 天
- 普通组：30 天
- 高级组：90 天
- 企业组：永久保留

---

**4. 关于 Bot 的部署方式**

Bot 应该：
- **选项 A**：作为 Dashboard 的一部分运行（集成在 Node.js 进程中）
- **选项 B**：独立部署为一个单独的服务
- **选项 C**：作为 Synapse 的一个模块运行

**我的建议：选项 B**（独立服务），理由是：
- ✅ 便于重启和调试
- ✅ 不影响 Dashboard 的稳定性
- ✅ 可以独立扩展

---

**5. 关于审计日志的保留期**

`operation_logs` 表会不断增长。你打算：
- 永久保留？
- 保留 1 年后归档？
- 保留 2 年后删除？

**我的建议：** 保留 2 年，然后导出到 S3/MinIO 归档。

---

**6. 关于 Synapse 修改的回滚策略**

如果未来 Synapse 官方更新，你的修改可能会冲突。你打算：
- **选项 A**：维护一个长期分支，手动合并官方更新
- **选项 B**：将修改做成 Synapse 插件（但 Synapse 目前没有官方插件系统）
- **选项 C**：定期 rebase，保持修改最小化

**我的建议：选项 C**，并编写详细的修改文档。

---

## 七、最佳的源代码修改方式

### 修改 Synapse 的最佳实践

**原则：**
1. **最小化改动**：只在必要的地方添加检查，不修改核心逻辑
2. **向后兼容**：所有改动都应该可以通过配置开关
3. **清晰标注**：所有修改的地方都添加 `# DASHBOARD INTEGRATION` 注释

**具体修改策略：**

```python
# synapse/handlers/auth.py

class AuthHandler:
    def __init__(self, hs):
        # ... 原有代码 ...
        
        # DASHBOARD INTEGRATION: 初始化 Dashboard 集成模块
        if hs.config.dashboard.enabled:
            self.dashboard = DashboardIntegration(hs)
        else:
            self.dashboard = None
    
    async def check_password(self, user_id: str, password: str):
        # 原有逻辑
        if not self._verify_password(user_id, password):
            raise AuthError("Invalid password")
        
        # DASHBOARD INTEGRATION: 风控检查
        if self.dashboard:
            ban_status = await self.dashboard.check_user_ban(user_id)
            if ban_status.is_hard_banned:
                raise AuthError("Account not found")
        
        return True
```

**文件组织：**
```
synapse/
├── dashboard_integration/
│   ├── __init__.py
│   ├── cache.py          # 缓存管理
│   ├── pubsub.py         # Pub/Sub 订阅
│   ├── db_queries.py     # 数据库查询
│   └── config.py         # 配置定义
└── config/
    └── dashboard.py      # Dashboard 配置
```

**配置文件示例：**
```yaml
# homeserver.yaml
dashboard:
  enabled: true
  redis:
    host: localhost
    port: 6379
  postgres:
    # 使用与 Synapse 相同的数据库配置
```
