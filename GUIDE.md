# Matrix Dashboard Project Complete Design Documentation

## 1. Project Goals and Boundaries

### Core Objectives
Build an **independent management Dashboard system** for Synapse Matrix servers, implementing:

1. **User Risk Control Management**: Silence, soft ban, hard ban, soft delete (four-level control system)
2. **User Registration Management**: Email/phone verification, CAPTCHA validation, administrator approval
3. **User Group Management**: Storage quotas and functional limitations for different user groups
4. **Media Storage Management**: File deduplication, cooldown deletion, MinIO integration
5. **Appeal System**: Appeal collection via Bot, administrator processing, result feedback
6. **Audit Logging**: Complete records of all administrative operations

### Key Constraints
- ✅ **Preserve Synapse Core Functionality**: End-to-end encryption, federation, basic chat functionality must remain intact
- ✅ **Minimize Synapse Modifications**: Only insert control logic at necessary checkpoints
- ✅ **Internal Network Deployment**: All services run on 127.0.0.1, not externally exposed
- ✅ **Data Consistency Priority**: Use shared database + Redis cache invalidation mechanism

### Non-Goals (Phase 1)
- ❌ Mobile client customization (Web implementation takes priority)
- ❌ Risk control synchronization between federated servers
- ❌ AI-powered content moderation (manual moderation implemented first)
- ❌ Payment/subscription system (manual user group assignment)

---

## 2. Overall Architecture Design

### System Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Shared Database)             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Synapse Schema: users, rooms, events, media          │   │
│  │ Dashboard Schema: user_bans, appeals, operation_logs │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────┬───────────────────┘
             │ Read/Write                  │ Read/Write
┌────────────▼──────────┐    ┌───────────▼───────────────┐
│  Synapse (Executor)   │    │  Dashboard (Manager)      │
│  ┌─────────────────┐  │    │  ┌──────────────────────┐ │
│  │Authentication   │  │    │  │HTTP API (Node.js)    │ │
│  │Checkpoints      │  │    │  │- /api/v1/users       │ │
│  │Message Send     │  │    │  │- /api/v1/bans        │ │
│  │Checkpoints      │  │    │  │- /api/v1/appeals     │ │
│  │File Upload      │  │    │  │- /api/v1/media       │ │
│  │Checkpoints      │  │    │  └──────────────────────┘ │
│  │Local Cache      │  │    │                           │
│  │(Redis)          │  │    │  ┌──────────────────────┐ │
│  └─────────────────┘  │    │  │Pub/Sub Publisher     │ │
│                       │    │  └──────────────────────┘ │
│  ┌─────────────────┐  │    └────────────┬──────────────┘
│  │Pub/Sub Subscriber│ │                 │
│  └─────────────────┘  │                 │
└───────────┬───────────┘                 │
            │                              │
            └──────────┬───────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │  Redis (Message Bus+Cache)│
         │  - Pub/Sub: user.banned   │
         │  - Cache: user:*:routing  │
         └───────────────────────────┘
                       ↑
         ┌─────────────┴─────────────┐
         │  Matrix Bot (Appeal Assistant)│
         │  - Collect appeal information│
         │  - Query Dashboard API      │
         │  - Send results to users    │
         └───────────────────────────┘
```

### Data Flow

**Risk Control Operation Flow:**
```
Administrator bans user Alice in Dashboard
  ↓
Dashboard modifies database (INSERT INTO user_bans)
  ↓
Dashboard deletes Redis cache (redis.delete("user:alice:routing"))
  ↓
Dashboard publishes event (redis.publish("user.banned", {...}))
  ↓
Synapse subscriber receives event, deletes local cache
  ↓
On Alice's next login attempt, Synapse queries database for latest status
  ↓
Synapse rejects login and disconnects all existing connections
```

**Message Send Flow:**
```
User Bob sends message in room
  ↓
Synapse checks cache (user:bob:routing)
  ↓
Cache hit: Bob not banned, continue processing
  ↓
Synapse retrieves room member list
  ↓
Batch query all member status (Redis MGET)
  ↓
Filter out hard-banned members
  ↓
Only push messages to active members
```

---

## 3. Database Design

### Schema Separation Strategy

**Problem: How do Synapse and Dashboard share the database while maintaining separation?**

**Optimal Solution: Utilize PostgreSQL Schema Separation**

```sql
-- Synapse utilizes default public schema
CREATE SCHEMA IF NOT EXISTS public;
-- All Synapse tables reside here: users, rooms, events, etc.

-- Dashboard utilizes independent dashboard schema
CREATE SCHEMA IF NOT EXISTS dashboard;
-- All Dashboard tables reside here
```

**Advantages:**
- ✅ Clear logical separation, no schema conflicts
- ✅ Simplified permission management (Synapse read-only access to dashboard schema)
- ✅ Independent migration and backup procedures
- ✅ Facilitates future separation into independent database instances

---

### Complete Table Structure Design

#### 1. Dashboard Schema Core Tables

```sql
-- ============================================
-- Dashboard Schema
-- ============================================
CREATE SCHEMA IF NOT EXISTS dashboard;

-- --------------------------------------------
-- User Extended Information Table
-- Stores Dashboard-specific user metadata
-- --------------------------------------------
CREATE TABLE dashboard.user_profiles (
  id SERIAL PRIMARY KEY,
  synapse_user_id VARCHAR(255) UNIQUE NOT NULL, -- References Synapse user ID
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
-- Risk Control Records Table
-- Stores all ban/silence records (including historical)
-- --------------------------------------------
CREATE TABLE dashboard.user_bans (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  ban_type VARCHAR(50) NOT NULL, -- 'silence'/'soft_ban'/'hard_ban'/'soft_delete'
  reason TEXT,
  violation_level VARCHAR(50), -- 'minor'/'normal'/'severe'
  violation_count INT DEFAULT 1,
  start_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP, -- NULL indicates permanent ban
  status VARCHAR(50) DEFAULT 'active', -- active/lifted/appealed
  created_by VARCHAR(255), -- Administrator ID
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  INDEX idx_user_active_bans (user_id, status, expires_at)
);

-- --------------------------------------------
-- Appeal Records Table
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
  appeal_count INT DEFAULT 1, -- Appeal attempt count
  created_at TIMESTAMP DEFAULT now(),
  decided_at TIMESTAMP,
  
  FOREIGN KEY (ban_id) REFERENCES dashboard.user_bans(id),
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  INDEX idx_pending_appeals (status, created_at)
);

-- --------------------------------------------
-- Registration Blacklist Table
-- --------------------------------------------
CREATE TABLE dashboard.registration_blacklist (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL, -- 'username'/'email'/'phone'/'ip'/'device_fingerprint'
  value VARCHAR(255) NOT NULL,
  reason VARCHAR(255),
  banned_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP, -- NULL indicates permanent blacklisting
  created_by VARCHAR(255),
  
  UNIQUE (type, value),
  INDEX idx_blacklist_lookup (type, value)
);

-- --------------------------------------------
-- User Group Configuration Table
-- --------------------------------------------
CREATE TABLE dashboard.user_groups (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(100) UNIQUE NOT NULL,
  storage_limit_mb INT, -- Storage quota in megabytes
  msg_rate_limit INT, -- Messages per minute limit
  ocr_daily_limit INT,
  pdf_daily_limit INT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Insert default user groups
INSERT INTO dashboard.user_groups (group_name, storage_limit_mb, msg_rate_limit, ocr_daily_limit, pdf_daily_limit) VALUES
  ('free', 100, 10, 10, 10),
  ('normal', 1024, 30, 50, 50),
  ('premium', 10240, 100, 200, 200),
  ('enterprise', NULL, NULL, NULL, NULL);

-- --------------------------------------------
-- Media Metadata Table
-- --------------------------------------------
CREATE TABLE dashboard.media_metadata (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(255),
  event_id VARCHAR(255),
  user_id INT,
  content_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA256 hash
  size_bytes BIGINT,
  mimetype VARCHAR(100),
  stored_on_server BOOLEAN DEFAULT FALSE,
  server_url TEXT,
  thumbnail_url TEXT,
  metadata JSONB, -- Additional metadata
  uploaded_at TIMESTAMP DEFAULT now(),
  last_accessed_at TIMESTAMP,
  cooldown_expires_at TIMESTAMP, -- Cooldown expiration timestamp
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  INDEX idx_content_hash (content_hash),
  INDEX idx_cooldown (cooldown_expires_at)
);

-- --------------------------------------------
-- Storage Policy Table
-- --------------------------------------------
CREATE TABLE dashboard.storage_policies (
  id SERIAL PRIMARY KEY,
  scope_type VARCHAR(50) NOT NULL, -- 'global'/'room'/'user'
  scope_id VARCHAR(255), -- NULL indicates global scope
  policy JSONB NOT NULL, -- Policy configuration details
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE (scope_type, scope_id)
);

-- Insert default global policy
INSERT INTO dashboard.storage_policies (scope_type, scope_id, policy) VALUES
  ('global', NULL, '{"text": "server", "thumbnail": "server", "media": "client_priority"}');

-- --------------------------------------------
-- Operation Logs Table
-- --------------------------------------------
CREATE TABLE dashboard.operation_logs (
  id SERIAL PRIMARY KEY,
  operator_id VARCHAR(255) NOT NULL, -- Administrator ID
  action VARCHAR(255) NOT NULL, -- 'ban_user'/'approve_registration'/'lift_ban'
  target_user_id INT,
  details JSONB, -- Operation details
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT now(),
  
  INDEX idx_operator (operator_id, created_at),
  INDEX idx_target (target_user_id, created_at)
);

-- --------------------------------------------
-- Two-Factor Authentication Configuration Table
-- --------------------------------------------
CREATE TABLE dashboard.user_2fa_settings (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  secondary_password_hash VARCHAR(255), -- bcrypt hash
  totp_secret VARCHAR(255), -- Base32 encoded TOTP secret
  totp_enabled BOOLEAN DEFAULT FALSE,
  email_2fa_enabled BOOLEAN DEFAULT FALSE,
  phone_2fa_enabled BOOLEAN DEFAULT FALSE,
  safety_codes TEXT[], -- Array of 10 safety codes
  recovery_key_encrypted TEXT, -- Encrypted Recovery Key
  trusted_device_ids TEXT[],
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id)
);

-- --------------------------------------------
-- Device Registration Table
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
-- Pending Messages During Hard Ban Table
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

### Synapse Table Association

**Critical Implementation Detail: How does Dashboard associate with Synapse users?**

Synapse user ID format follows: `@username:domain` (e.g., `@alice:example.com`).

**Implementation Strategy:**
1. Dashboard's `user_profiles.synapse_user_id` stores the complete Matrix ID
2. When Synapse requires user status verification, utilize this ID for queries

```python
# Query implementation within Synapse
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

## 4. Technology Stack and Dependencies

### Dashboard Backend
- **Programming Language**: Node.js 20+ (TypeScript)
- **Web Framework**: Express.js 4.x
- **Database**: PostgreSQL 15+ (utilizing `pg` library)
- **Cache/Message Bus**: Redis 7+ (utilizing `ioredis` library)
- **Authentication**: JWT (utilizing `jsonwebtoken`)
- **Email Service**: Brevo API (utilizing `@getbrevo/brevo`)
- **Object Storage**: MinIO (utilizing `minio` library)
- **CAPTCHA Service**: Cloudflare Turnstile

### Dashboard Frontend
- **Framework**: React 18+ (TypeScript)
- **Build Tool**: Vite 5
- **UI Component Library**: shadcn/ui + Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router 6

### Synapse Modifications
- **Programming Language**: Python 3.11+
- **Asynchronous Framework**: Twisted
- **Redis Client**: `redis-py`
- **Database Adapter**: `psycopg2` (PostgreSQL)

### Infrastructure
- **Containerization**: Docker + Docker Compose (development environment)
- **Reverse Proxy**: Nginx (production environment)

---

## 5. Implementation Roadmap

### Phase 1: Infrastructure Setup (Week 1-2)

#### 1.1 Development Environment Configuration
```bash
# Create project directory structure
mkdir matrix-admin-system
cd matrix-admin-system

# Initialize Dashboard backend
mkdir dashboard
cd dashboard
npm init -y
npm install express typescript @types/node @types/express
npm install pg ioredis jsonwebtoken bcrypt
npm install -D nodemon ts-node

# Initialize customized Synapse branch
cd ..
git clone https://github.com/element-hq/synapse.git synapse-custom
cd synapse-custom
git checkout -b feature/dashboard-integration
```

#### 1.2 Docker Compose Local Development Environment
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

#### 1.3 Database Schema Initialization
```bash
# Start PostgreSQL container
docker-compose up -d postgres

# Execute database migration scripts
psql -h localhost -U synapse -d synapse -f migrations/001_create_dashboard_schema.sql
```

**Acceptance Criteria:**
- ✅ PostgreSQL, Redis, MinIO containers running normally
- ✅ Dashboard schema and all associated tables created successfully
- ✅ Able to query and verify table structures via `psql` command-line interface

---

### Phase 2: Dashboard Core API Development (Week 3-4)

#### 2.1 Project Architecture Setup
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

export const redisPub = new Redis(); // Dedicated publisher instance
export const redisSub = new Redis(); // Dedicated subscriber instance
```

#### 2.2 Core Service Implementation

**User Ban Management Service**
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
      
      // 1. Insert ban record into database
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
      
      // 2. Immediately invalidate cache
      await redis.del(`user:${userId}:routing`);
      
      // 3. Publish Pub/Sub event for real-time synchronization
      await redisPub.publish('user.banned', JSON.stringify({
        user_id: userId,
        ban_type: banType,
        expires_at: expiresAt,
        timestamp: new Date().toISOString()
      }));
      
      // 4. For hard bans, additionally publish connection termination event
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
    // Implementation follows similar pattern: database update → cache invalidation → event publication
  }
}
```

#### 2.3 HTTP API Route Implementation
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

**Acceptance Criteria:**
- ✅ User ban operations executable via REST API endpoints
- ✅ Database correctly inserts ban records with proper metadata
- ✅ Redis cache entries properly invalidated upon ban operations
- ✅ Pub/Sub events successfully published (verifiable via redis-cli monitoring)

---

### Phase 3: Synapse Integration Implementation (Week 5-6)

#### 3.1 Synapse Modification Point Identification

**Primary Files Requiring Modification:**
1. `synapse/handlers/auth.py` - Authentication checkpoint integration
2. `synapse/handlers/message.py` - Message transmission validation
3. `synapse/handlers/room.py` - Room operation authorization
4. `synapse/rest/media/v1/upload_resource.py` - Media upload permission verification

#### 3.2 Cache Management and Pub/Sub Subscription Implementation

**New Integration Module within Synapse**
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
        
        # Initialize event subscription
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
            # Invalidate local cache entry
            self.redis_client.delete(f"user:{user_id}:routing")
            
        elif channel == 'user.force_disconnect':
            # Terminate all active user sessions
            self._terminate_user_sessions(user_id)
    
    def get_user_routing_state(self, user_id: str) -> Optional[Dict[str, Any]]:
        # Attempt cache retrieval first
        cached = self.redis_client.get(f"user:{user_id}:routing")
        if cached:
            return json.loads(cached)
        
        # Cache miss scenario - query database
        # (Requires PostgreSQL database access)
        return self._load_from_db(user_id)
    
    def _load_from_db(self, user_id: str) -> Dict[str, Any]:
        # Database query implementation
        pass
```

#### 3.3 Authentication Checkpoint Integration

```python
# synapse/handlers/auth.py
from synapse.dashboard_integration import DashboardIntegration

class AuthHandler:
    def __init__(self, hs):
        # ... Original initialization logic ...
        self.dashboard = DashboardIntegration(hs.config.dashboard)
    
    async def check_password(self, user_id: str, password: str):
        # Original password verification logic
        if not self._verify_password(user_id, password):
            raise AuthError("Invalid password")
        
        # DASHBOARD INTEGRATION: Risk control verification
        user_state = self.dashboard.get_user_routing_state(user_id)
        if user_state and user_state.get('is_hard_banned'):
            raise AuthError("Account not found")  # Security note: Avoid revealing "banned" status
        
        return True
```

**Acceptance Criteria:**
- ✅ Banned users successfully prevented from authentication
- ✅ Synapse properly subscribes to Redis Pub/Sub channels
- ✅ Cache invalidation mechanism functions correctly across services
- ✅ Hard-banned users' active connections immediately terminated

---

### Phase 4: Bot and Appeal System Implementation (Week 7-8)

#### 4.1 Bot Account Creation
```bash
# Create dedicated Bot user within Synapse
curl -X POST http://localhost:8008/_synapse/admin/v2/users/@admin_bot:example.com \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"password": "bot_password", "admin": false}'
```

#### 4.2 Bot Service Implementation
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
    
    // Guide user through appeal information collection
    await this.client.sendTextMessage(roomId, 
      'Please provide the following information:\n1. Your contact email address\n2. Reason for appeal\n3. Detailed incident description'
    );
    
    // Collect information and submit to Dashboard API
    const appealData = await this.collectAppealInfo(sender, roomId);
    
    // Submit appeal to Dashboard backend
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
        'Your appeal has been submitted (Appeal ID: ' + response.data.appealId + '), administrator will review within 24 hours.'
      );
    } catch (error) {
      await this.client.sendTextMessage(roomId,
        'Appeal submission failed, please try again later or contact support@example.com via email'
      );
    }
  }
  
  async handleVerify(event: any) {
    // Friend verification workflow implementation
    const sender = event.getSender();
    const message = event.getContent().body;
    const parts = message.split(' ');
    
    if (parts.length !== 3) {
      await this.client.sendTextMessage(event.getRoomId(),
        'Invalid command format. Correct usage: /verify @username:domain verification_hash'
      );
      return;
    }
    
    const targetUser = parts[1];
    const hashCode = parts[2];
    
    // Verify friend relationship and temporal validity
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
          'Verification successful! Your friend can now access their account.'
        );
      } else {
        await this.client.sendTextMessage(event.getRoomId(),
          'Verification failed: ' + response.data.reason
        );
      }
    } catch (error) {
      await this.client.sendTextMessage(event.getRoomId(),
        'Verification failed, please verify you have appropriate permissions for this operation.'
      );
    }
  }
  
  async collectAppealInfo(sender: string, roomId: string): Promise<any> {
    // State machine implementation for multi-turn conversation
    // Simplified example - production requires complete conversation flow
    return {
      email: 'user@example.com',
      reason: 'I believe the ban was applied in error',
      description: 'Detailed incident description...'
    };
  }
}

// Bot service initialization
const bot = new AdminBot();
bot.start().catch(console.error);
```

#### 4.3 Dashboard Appeal Management API

```typescript
// dashboard/src/routes/appeals.ts
import express from 'express';
import { pool } from '../config/database';
import { redisPub } from '../config/redis';

const router = express.Router();

// Bot-mediated appeal submission endpoint
router.post('/appeals', async (req, res) => {
  const { userId, email, reason, description } = req.body;
  
  try {
    // Query user's active ban records
    const banResult = await pool.query(`
      SELECT ub.id, ub.ban_type, up.synapse_user_id
      FROM dashboard.user_bans ub
      JOIN dashboard.user_profiles up ON ub.user_id = up.id
      WHERE up.synapse_user_id = $1 AND ub.status = 'active'
      ORDER BY ub.created_at DESC
      LIMIT 1
    `, [userId]);
    
    if (banResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active ban records found for user' });
    }
    
    const ban = banResult.rows[0];
    
    // Check previous appeal attempts
    const appealCountResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM dashboard.appeals
      WHERE ban_id = $1
    `, [ban.id]);
    
    const appealCount = parseInt(appealCountResult.rows[0].count) + 1;
    
    // Insert new appeal record
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
    console.error('Appeal submission failed:', error);
    res.status(500).json({ error: 'Appeal submission failed' });
  }
});

// Administrator appeal decision endpoint
router.post('/appeals/:id/decide', async (req, res) => {
  const appealId = req.params.id;
  const { decision, response, adminId } = req.body; // decision: 'approve'/'reject'
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update appeal status
    await client.query(`
      UPDATE dashboard.appeals
      SET status = $1, admin_response = $2, admin_id = $3, decided_at = now()
      WHERE id = $4
    `, [decision === 'approve' ? 'approved' : 'rejected', response, adminId, appealId]);
    
    // If appeal approved, process user unban
    if (decision === 'approve') {
      const appealInfo = await client.query(`
        SELECT ban_id, user_id FROM dashboard.appeals WHERE id = $1
      `, [appealId]);
      
      const banId = appealInfo.rows[0].ban_id;
      const userId = appealInfo.rows[0].user_id;
      
      // Update ban status to lifted
      await client.query(`
        UPDATE dashboard.user_bans
        SET status = 'lifted'
        WHERE id = $1
      `, [banId]);
      
      // Retrieve synapse_user_id for cache operations
      const userInfo = await client.query(`
        SELECT synapse_user_id FROM dashboard.user_profiles WHERE id = $1
      `, [userId]);
      
      const synapseUserId = userInfo.rows[0].synapse_user_id;
      
      // Invalidate cache entries
      await client.query(`SELECT pg_notify('cache_invalidate', $1)`, [synapseUserId]);
      
      // Publish unban event for real-time synchronization
      await redisPub.publish('user.unbanned', JSON.stringify({
        user_id: synapseUserId,
        timestamp: new Date().toISOString()
      }));
    }
    
    await client.query('COMMIT');
    
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Appeal processing failed:', error);
    res.status(500).json({ error: 'Appeal processing failed' });
  } finally {
    client.release();
  }
});

export default router;
```

**Acceptance Criteria:**
- ✅ Users can successfully submit appeals via Bot interaction
- ✅ Appeal information correctly persisted to database
- ✅ Administrators can view and process appeals through Dashboard interface
- ✅ Approved appeals result in user unbans and restored access

---

### Phase 5: Frontend Dashboard UI Development (Week 9-10)

#### 5.1 Frontend Project Structure

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

#### 5.2 Core Component Implementation Examples

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
      // Trigger user list refresh
    }
  });
  
  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        <button className="btn-primary">Export Report</button>
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
          Ban User: {user.username}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block mb-2">Ban Type</label>
            <select 
              value={banType} 
              onChange={(e) => setBanType(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="silence">Silence</option>
              <option value="soft_ban">Soft Ban</option>
              <option value="hard_ban">Hard Ban</option>
            </select>
          </div>
          
          <div>
            <label className="block mb-2">Duration (hours)</label>
            <input 
              type="number" 
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block mb-2">Reason</label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows={4}
            />
          </div>
          
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="bg-red-600">
              Confirm Ban
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
```

**Acceptance Criteria:**
- ✅ Administrators can successfully authenticate into Dashboard interface
- ✅ Comprehensive user list and detailed user information viewable
- ✅ User ban operations executable through modal interface
- ✅ Appeal list accessible and appeal processing functional
- ✅ All administrative operations properly recorded in audit logs

---

### Phase 6: Client Customization Implementation (Week 11-12)

#### 6.1 Element Web Fork Creation
```bash
git clone https://github.com/element-hq/element-web.git element-web-custom
cd element-web-custom
git checkout -b feature/dashboard-integration
npm install
```

#### 6.2 Two-Factor Authentication Login Flow Enhancement

**Modification Location:** `src/components/structures/auth/Login.tsx`

```typescript
// src/components/structures/auth/Login.tsx
async function handleLogin(username: string, password: string) {
  try {
    // Step 1: Standard Matrix authentication
    const loginResponse = await matrixClient.login('m.login.password', {
      user: username,
      password: password
    });
    
    // Step 2: Check 2FA requirement status
    const userInfo = await fetch(`${dashboardApiUrl}/users/${username}/2fa-status`, {
      headers: {
        'Authorization': `Bearer ${loginResponse.access_token}`
      }
    });
    
    const { requires2FA } = await userInfo.json();
    
    if (requires2FA) {
      // Step 3: Display 2FA verification interface
      setShow2FAModal(true);
      setPendingLogin(loginResponse);
    } else {
      // Complete authentication process
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
      showError('Two-factor authentication verification failed');
    }
  } catch (error) {
    showError(error.message);
  }
}
```

#### 6.3 Enhanced Registration Flow Implementation

**Custom Registration Component**

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
    // Step 1: CAPTCHA verification completion check
    if (!turnstileToken) {
      showError('Please complete CAPTCHA verification');
      return;
    }
    
    // Step 2: Submit registration application
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
        // Email verification required
        setStep(2);
      } else if (result.requiresApproval) {
        // Administrator approval required
        showMessage('Your registration application has been submitted, awaiting administrator approval');
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
            placeholder="Username"
            value={formData.username}
            onChange={(e) => setFormData({...formData, username: e.target.value})}
          />
          <input 
            type="email" 
            placeholder="Email address"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />
          {/* Additional registration fields... */}
          
          <Turnstile 
            siteKey={process.env.TURNSTILE_SITE_KEY}
            onVerify={setTurnstileToken}
          />
          
          <button type="submit">Submit Registration</button>
        </form>
      )}
      
      {step === 2 && (
        <div>
          <p>Verification code has been sent to {formData.email}</p>
          <input 
            type="text" 
            placeholder="Enter verification code"
            onChange={(e) => verifyCode(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
```

**Acceptance Criteria:**
- ✅ User registration possible through customized client interface
- ✅ CAPTCHA verification successfully integrated into registration flow
- ✅ Email verification codes properly delivered and validated
- ✅ Two-factor authentication workflow functions correctly during login
- ✅ Banned users effectively prevented from authentication

---

## 6. Outstanding Technical Decisions

The overall project architecture is well-defined, but several implementation details require executive decisions:

### Critical Decision Points

**1. Synapse User Table Extension Methodology**
- **Option A**: Dashboard creates independent `user_profiles` table with `synapse_user_id` foreign key relationship
- **Option B**: Direct column additions to Synapse `users` table (user_group, registration_status, etc.)
- **Option C**: PostgreSQL VIEW utilization for unified query interface

**Technical Recommendation: Option A** (independent table + foreign key), rationale:
- ✅ Preserves Synapse table structure integrity
- ✅ Facilitates future system migration and upgrades
- ✅ Enables clear permission boundary separation

Do you concur with this architectural approach?

---

**2. Device Fingerprint Implementation Strategy**

Device fingerprint generation must occur client-side. Preferred implementation approach:
- **Option A**: Leverage established library (FingerprintJS)
- **Option B**: Custom implementation (User-Agent + Canvas fingerprinting + WebGL fingerprinting)
- **Option C**: Simplified approach (User-Agent + IP address only)

**Technical Recommendation: Option A** (FingerprintJS library), provides superior reliability and accuracy.

---

**3. Media Storage Cooldown Mechanism Configuration**

Documented requirement: "Delete after cooldown period expiration, reset cooldown upon identical hash file re-upload".

**Implementation Question:** Default cooldown duration specification?
- 24 hours?
- 7 days?
- 30 days?

Should cooldown periods vary by user group classification?

**Technical Recommendation:**
- Free tier: 7 days
- Normal tier: 30 days
- Premium tier: 90 days
- Enterprise tier: Permanent retention

---

**4. Bot Service Deployment Architecture**

Bot service deployment model:
- **Option A**: Integrated within Dashboard process (Node.js runtime)
- **Option B**: Independently deployed as separate service
- **Option C**: Embedded as Synapse module

**Technical Recommendation: Option B** (independent service), advantages:
- ✅ Simplified restart and debugging procedures
- ✅ Dashboard stability isolation
- ✅ Independent scalability

---

**5. Audit Log Retention Policy**

`operation_logs` table exhibits continuous growth. Retention strategy:
- Permanent retention?
- 1-year retention with archival?
- 2-year retention with deletion?

**Technical Recommendation:** 2-year retention period, followed by S3/MinIO archival export.

---

**6. Synapse Modification Maintenance Strategy**

Future Synapse upstream updates may introduce integration conflicts. Maintenance approach:
- **Option A**: Maintain long-term feature branch with manual upstream merges
- **Option B**: Implement modifications as Synapse plugins (no official plugin system currently)
- **Option C**: Regular rebase strategy with minimal modification footprint

**Technical Recommendation: Option C**, complemented by comprehensive modification documentation.

---

## 7. Optimal Source Code Modification Methodology

### Synapse Modification Best Practices

**Core Principles:**
1. **Minimal Impact**: Only introduce checks at necessary interception points, preserve core logic
2. **Backward Compatibility**: All modifications configurable via feature flags
3. **Explicit Annotation**: Mark all modification points with `# DASHBOARD INTEGRATION` comments

**Implementation Strategy:**

```python
# synapse/handlers/auth.py

class AuthHandler:
    def __init__(self, hs):
        # ... Original initialization code ...
        
        # DASHBOARD INTEGRATION: Initialize Dashboard integration module
        if hs.config.dashboard.enabled:
            self.dashboard = DashboardIntegration(hs)
        else:
            self.dashboard = None
    
    async def check_password(self, user_id: str, password: str):
        # Original authentication logic
        if not self._verify_password(user_id, password):
            raise AuthError("Invalid password")
        
        # DASHBOARD INTEGRATION: Risk control verification
        if self.dashboard:
            ban_status = await self.dashboard.check_user_ban(user_id)
            if ban_status.is_hard_banned:
                raise AuthError("Account not found")
        
        return True
```

**Module Organization:**
```
synapse/
├── dashboard_integration/
│   ├── __init__.py
│   ├── cache.py          # Cache management implementation
│   ├── pubsub.py         # Pub/Sub subscription handling
│   ├── db_queries.py     # Database query abstractions
│   └── config.py         # Configuration definition
└── config/
    └── dashboard.py      # Dashboard-specific configuration
```

**Configuration Schema Example:**
```yaml
# homeserver.yaml
dashboard:
  enabled: true
  redis:
    host: localhost
    port: 6379
  postgres:
    # Inherits Synapse database configuration
```