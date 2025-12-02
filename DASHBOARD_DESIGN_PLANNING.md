```markdown
# Matrix Dashboard 完整设计文档

## 文档版本信息
- **版本**: 1.0.0
- **最后更新**: 2025-01-XX
- **文档类型**: 技术设计规范
- **适用范围**: Dashboard 前后端开发、UI/UX 设计

---

## 目录

1. [系统架构概览](#1-系统架构概览)
2. [数据库设计](#2-数据库设计)
3. [后端监控页面设计](#3-后端监控页面设计)
4. [前端 Dashboard 详细设计](#4-前端-dashboard-详细设计)
5. [权限与评分系统](#5-权限与评分系统)
6. [UI/UX 设计规范](#6-uiux-设计规范)
7. [交互流程设计](#7-交互流程设计)
8. [多语言与帮助系统](#8-多语言与帮助系统)

---

## 1. 系统架构概览

### 1.1 三层架构设计

```
┌─────────────────────────────────────────────────────────┐
│  前端 Dashboard (端口 3000)                             │
│  - 管理员登录认证                                        │
│  - 可视化数据展示                                        │
│  - 权限管理界面                                          │
│  - 成员管理界面                                          │
│  - 个性化设置                                            │
└─────────────────────────────────────────────────────────┘
                        ↓ HTTP API
┌─────────────────────────────────────────────────────────┐
│  Dashboard 后端 API (端口 3000)                         │
│  - RESTful API                                          │
│  - JWT 认证                                             │
│  - 业务逻辑处理                                          │
│  - 数据库操作                                            │
│  - Pub/Sub 事件发布                                     │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  后端监控页面 (端口 3001 - 完全公开)                    │
│  - 实时系统状态                                          │
│  - 服务器资源监控                                        │
│  - 服务健康检查                                          │
│  - 只读展示，无操作权限                                  │
└─────────────────────────────────────────────────────────┘
                        ↓
         ┌──────────────┴──────────────┐
         ↓                              ↓
┌──────────────────┐         ┌──────────────────┐
│  PostgreSQL      │         │  Redis           │
│  - 共享数据库    │         │  - 缓存层        │
│  - Synapse 表    │         │  - Pub/Sub       │
│  - Dashboard 表  │         │  - 会话存储      │
└──────────────────┘         └──────────────────┘
```

### 1.2 端口分配

| 服务 | 端口 | 访问权限 | 说明 |
|------|------|----------|------|
| Synapse | 8008 | 公开（内网） | Matrix 服务器 |
| Dashboard 前端 | 3000 | 需要登录 | 管理员 Dashboard |
| Dashboard 后端 API | 3000 | 需要 JWT | RESTful API |
| 后端监控页面 | 3001 | 完全公开（内网） | 系统监控面板 |
| PostgreSQL | 5432 | 内部访问 | 数据库 |
| Redis | 6379 | 内部访问 | 缓存和消息队列 |
| MinIO | 9000 | 内部访问 | 对象存储 |

---

## 2. 数据库设计

### 2.1 管理员权限系统表

#### 表：dashboard.admin_users（管理员用户表）

```sql
CREATE TABLE dashboard.admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  admin_level INT NOT NULL, -- 1=超级管理员, 2=管理员, 3=小管, 可扩展
  created_by INT, -- 创建者ID
  created_at TIMESTAMP DEFAULT now(),
  last_login_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active', -- active/suspended/inactive
  
  FOREIGN KEY (created_by) REFERENCES dashboard.admin_users(id)
);

-- 创建默认超级管理员（服务器初始化时）
INSERT INTO dashboard.admin_users (username, password_hash, display_name, admin_level)
VALUES ('superadmin', '$bcrypt_hash', '超级管理员', 1);
```

#### 表：dashboard.admin_roles（管理员角色定义表）

```sql
CREATE TABLE dashboard.admin_roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) UNIQUE NOT NULL, -- super_admin/admin/moderator/...
  role_level INT UNIQUE NOT NULL, -- 1, 2, 3, ...
  display_name JSONB NOT NULL, -- {"zh-CN": "管理员", "en": "Admin"}
  description JSONB,
  created_by INT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (created_by) REFERENCES dashboard.admin_users(id)
);

-- 插入默认角色
INSERT INTO dashboard.admin_roles (role_name, role_level, display_name, description) VALUES
  ('super_admin', 1, '{"zh-CN": "超级管理员", "en": "Super Admin"}', '{"zh-CN": "拥有全部权限", "en": "Full permissions"}'),
  ('admin', 2, '{"zh-CN": "管理员", "en": "Administrator"}', '{"zh-CN": "管理下级和用户", "en": "Manage subordinates and users"}'),
  ('moderator', 3, '{"zh-CN": "小管", "en": "Moderator"}', '{"zh-CN": "处理申诉和封禁", "en": "Handle appeals and bans"}');
```

#### 表：dashboard.permission_definitions（权限定义表）

```sql
CREATE TABLE dashboard.permission_definitions (
  id SERIAL PRIMARY KEY,
  permission_key VARCHAR(100) UNIQUE NOT NULL, -- 如 'ban_user', 'approve_registration'
  display_name JSONB NOT NULL,
  description JSONB,
  category VARCHAR(50), -- system/user_management/content_moderation/...
  is_base_config BOOLEAN DEFAULT FALSE, -- 是否为基础配置权限（只有超管可见）
  created_at TIMESTAMP DEFAULT now()
);

-- 插入权限定义
INSERT INTO dashboard.permission_definitions (permission_key, display_name, description, category, is_base_config) VALUES
  -- 系统配置权限（只有超级管理员）
  ('modify_base_config', '{"zh-CN": "修改基础配置", "en": "Modify base config"}', '{"zh-CN": "修改是否允许终端记录非文本、AI服务接入等基础配置", "en": "Modify basic system configurations"}', 'system', TRUE),
  ('manage_admin_roles', '{"zh-CN": "管理管理员角色", "en": "Manage admin roles"}', '{"zh-CN": "创建、修改、删除管理员角色", "en": "Create, modify, delete admin roles"}', 'system', TRUE),
  
  -- 管理员管理权限
  ('create_admin', '{"zh-CN": "创建管理员", "en": "Create admin"}', '{"zh-CN": "创建下级管理员账户", "en": "Create subordinate admin accounts"}', 'admin_management', FALSE),
  ('modify_admin_permissions', '{"zh-CN": "修改管理员权限", "en": "Modify admin permissions"}', '{"zh-CN": "修改下级管理员的权限上限", "en": "Modify subordinate admin permission limits"}', 'admin_management', FALSE),
  ('view_admin_list', '{"zh-CN": "查看管理员列表", "en": "View admin list"}', '{"zh-CN": "查看下级管理员的信息", "en": "View subordinate admin information"}', 'admin_management', FALSE),
  ('suspend_admin', '{"zh-CN": "暂停管理员", "en": "Suspend admin"}', '{"zh-CN": "暂停下级管理员的权限", "en": "Suspend subordinate admin permissions"}', 'admin_management', FALSE),
  
  -- 用户管理权限
  ('approve_registration', '{"zh-CN": "审核注册", "en": "Approve registration"}', '{"zh-CN": "审核用户注册申请", "en": "Approve user registration requests"}', 'user_management', FALSE),
  ('ban_user', '{"zh-CN": "封禁用户", "en": "Ban user"}', '{"zh-CN": "对用户执行封禁操作", "en": "Ban users"}', 'user_management', FALSE),
  ('unban_user', '{"zh-CN": "解封用户", "en": "Unban user"}', '{"zh-CN": "解除用户封禁", "en": "Unban users"}', 'user_management', FALSE),
  ('modify_user_group', '{"zh-CN": "修改用户组", "en": "Modify user group"}', '{"zh-CN": "修改用户所属的用户组", "en": "Modify user group membership"}', 'user_management', FALSE),
  ('manage_blacklist_add', '{"zh-CN": "添加黑名单", "en": "Add to blacklist"}', '{"zh-CN": "将邮箱/IP等添加到黑名单", "en": "Add email/IP to blacklist"}', 'user_management', FALSE),
  ('manage_blacklist_modify', '{"zh-CN": "修改黑名单", "en": "Modify blacklist"}', '{"zh-CN": "修改黑名单条目（放行）", "en": "Modify blacklist entries (whitelist)"}', 'user_management', FALSE),
  ('manage_blacklist_delete', '{"zh-CN": "删除黑名单", "en": "Delete from blacklist"}', '{"zh-CN": "彻底删除黑名单记录", "en": "Permanently delete blacklist records"}', 'user_management', FALSE),
  
  -- 申诉处理权限
  ('handle_appeal', '{"zh-CN": "处理申诉", "en": "Handle appeal"}', '{"zh-CN": "处理用户申诉", "en": "Handle user appeals"}', 'content_moderation', FALSE),
  ('view_appeal', '{"zh-CN": "查看申诉", "en": "View appeal"}', '{"zh-CN": "查看用户申诉记录", "en": "View user appeal records"}', 'content_moderation', FALSE),
  
  -- Bot 管理权限
  ('send_bot_message', '{"zh-CN": "发送Bot消息", "en": "Send bot message"}', '{"zh-CN": "通过Bot向用户发送消息", "en": "Send messages to users via bot"}', 'content_moderation', FALSE),
  
  -- 用户组配置权限
  ('configure_user_groups', '{"zh-CN": "配置用户组", "en": "Configure user groups"}', '{"zh-CN": "修改用户组的配额和权限", "en": "Modify user group quotas and permissions"}', 'system', FALSE);
```

#### 表：dashboard.admin_permissions（管理员权限表）

```sql
CREATE TABLE dashboard.admin_permissions (
  id SERIAL PRIMARY KEY,
  admin_id INT NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  granted BOOLEAN DEFAULT TRUE, -- 是否授予此权限
  granted_by INT, -- 授予者ID
  granted_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (admin_id) REFERENCES dashboard.admin_users(id),
  FOREIGN KEY (permission_key) REFERENCES dashboard.permission_definitions(permission_key),
  FOREIGN KEY (granted_by) REFERENCES dashboard.admin_users(id),
  UNIQUE (admin_id, permission_key)
);

CREATE INDEX idx_admin_permissions ON dashboard.admin_permissions(admin_id, granted);
```

#### 表：dashboard.admin_permission_limits（管理员权限上限表）

```sql
-- 用于记录上级对下级设置的权限"天花板"
CREATE TABLE dashboard.admin_permission_limits (
  id SERIAL PRIMARY KEY,
  superior_id INT NOT NULL, -- 上级管理员ID
  subordinate_role_level INT NOT NULL, -- 下级角色等级
  permission_key VARCHAR(100) NOT NULL,
  max_allowed BOOLEAN DEFAULT TRUE, -- 下级最多可拥有此权限
  set_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (superior_id) REFERENCES dashboard.admin_users(id),
  FOREIGN KEY (permission_key) REFERENCES dashboard.permission_definitions(permission_key),
  UNIQUE (superior_id, subordinate_role_level, permission_key)
);

-- 示例：超级管理员设置管理员（level=2）的权限上限
-- 如果没有记录，则默认继承角色的默认权限
```

#### 表：dashboard.admin_preferences（管理员个人偏好表）

```sql
CREATE TABLE dashboard.admin_preferences (
  admin_id INT PRIMARY KEY,
  language VARCHAR(10) DEFAULT 'zh-CN', -- zh-CN/en/zh-TW/ja/ko/...
  theme VARCHAR(20) DEFAULT 'dark', -- dark/light
  primary_color VARCHAR(7) DEFAULT '#3b82f6', -- 主题色 HEX
  accent_color VARCHAR(7) DEFAULT '#f59e0b', -- 强调色 HEX
  notification_email BOOLEAN DEFAULT TRUE,
  notification_push BOOLEAN DEFAULT TRUE,
  timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (admin_id) REFERENCES dashboard.admin_users(id)
);
```

### 2.2 用户处理与审核系统表

#### 表：dashboard.user_actions（用户操作记录表）

```sql
CREATE TABLE dashboard.user_actions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL, -- 目标用户ID
  action_type VARCHAR(50) NOT NULL, -- ban/unban/modify_group/approve_registration
  action_detail JSONB NOT NULL, -- 详细信息（封禁类型、时长、理由等）
  admin_id INT NOT NULL, -- 执行操作的管理员
  admin_level INT NOT NULL, -- 执行时管理员的等级
  status VARCHAR(20) DEFAULT 'pending', -- pending/cooldown/effective/overridden/cancelled
  cooldown_end_at TIMESTAMP, -- 冷却期结束时间（3天或7天后）
  effective_at TIMESTAMP, -- 实际生效时间
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (user_id) REFERENCES dashboard.user_profiles(id),
  FOREIGN KEY (admin_id) REFERENCES dashboard.admin_users(id)
);

CREATE INDEX idx_user_actions_status ON dashboard.user_actions(status, cooldown_end_at);
CREATE INDEX idx_user_actions_user ON dashboard.user_actions(user_id, created_at DESC);
```

#### 表：dashboard.action_reviews（操作审核记录表）

```sql
-- 记录多个管理员对同一用户操作的处理意见
CREATE TABLE dashboard.action_reviews (
  id SERIAL PRIMARY KEY,
  original_action_id INT NOT NULL, -- 关联到 user_actions
  reviewer_admin_id INT NOT NULL,
  reviewer_level INT NOT NULL,
  review_action VARCHAR(50), -- approve/modify/escalate
  modified_detail JSONB, -- 如果修改了原处理，记录新的详情
  severity_score INT, -- 严重度评分（基于评分系统）
  review_comment TEXT,
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (original_action_id) REFERENCES dashboard.user_actions(id),
  FOREIGN KEY (reviewer_admin_id) REFERENCES dashboard.admin_users(id)
);
```

#### 表：dashboard.admin_accuracy（管理员准确率记录表）

```sql
CREATE TABLE dashboard.admin_accuracy (
  admin_id INT PRIMARY KEY,
  total_actions INT DEFAULT 0, -- 总操作次数
  total_score_diff INT DEFAULT 0, -- 累计评分差异
  accuracy_rate DECIMAL(5,2) DEFAULT 0.00, -- 准确率（100 - 平均差异百分比）
  last_calculated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (admin_id) REFERENCES dashboard.admin_users(id)
);

-- 准确率计算公式（伪代码）：
-- avg_diff = total_score_diff / total_actions
-- accuracy_rate = MAX(0, 100 - (avg_diff / max_severity_score * 100))
```

#### 表：dashboard.severity_config（严重度配置表）

```sql
CREATE TABLE dashboard.severity_config (
  id SERIAL PRIMARY KEY,
  action_type VARCHAR(50) NOT NULL, -- silence/soft_ban/hard_ban/soft_delete
  min_duration_hours INT, -- 最小时长
  max_duration_hours INT, -- 最大时长
  base_score INT NOT NULL, -- 基础分数
  duration_multiplier DECIMAL(5,2) DEFAULT 1.0, -- 时长乘数
  updated_by INT,
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (updated_by) REFERENCES dashboard.admin_users(id)
);

-- 默认严重度配置
INSERT INTO dashboard.severity_config (action_type, min_duration_hours, max_duration_hours, base_score, duration_multiplier) VALUES
  ('silence', 1, 168, 10, 0.1), -- 禁言: 1小时-7天, 基础分10, 每小时+0.1分
  ('soft_ban', 24, 8760, 30, 0.05), -- 软封禁: 1天-1年, 基础分30, 每小时+0.05分
  ('hard_ban', 168, 17520, 60, 0.03), -- 硬封禁: 7天-2年, 基础分60, 每小时+0.03分
  ('soft_delete', 1440, NULL, 100, 0); -- 软删除: 60天起, 基础分100, 永久

-- 严重度评分计算公式（伪代码）：
-- severity_score = base_score + (duration_hours * duration_multiplier)
-- 例如：禁言24小时 = 10 + (24 * 0.1) = 12.4分
-- 例如：软封禁72小时 = 30 + (72 * 0.05) = 33.6分
```

### 2.3 举报与审核表

#### 表：dashboard.admin_reports（管理员举报表）

```sql
CREATE TABLE dashboard.admin_reports (
  id SERIAL PRIMARY KEY,
  reporter_id INT NOT NULL, -- 举报人ID
  reported_admin_id INT NOT NULL, -- 被举报人ID
  report_type VARCHAR(50), -- abuse_of_power/incorrect_judgment/inappropriate_behavior
  report_reason TEXT NOT NULL,
  evidence_files JSONB, -- 上传的证据文件路径
  related_action_ids INT[], -- 相关的操作记录ID数组
  status VARCHAR(20) DEFAULT 'pending', -- pending/under_review/resolved/dismissed
  reviewed_by INT, -- 处理人（超级管理员）
  review_result TEXT,
  action_taken JSONB, -- 采取的措施（暂停权限、警告等）
  created_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP,
  
  FOREIGN KEY (reporter_id) REFERENCES dashboard.admin_users(id),
  FOREIGN KEY (reported_admin_id) REFERENCES dashboard.admin_users(id),
  FOREIGN KEY (reviewed_by) REFERENCES dashboard.admin_users(id)
);

CREATE INDEX idx_admin_reports_status ON dashboard.admin_reports(status, created_at DESC);
```

### 2.4 多语言帮助系统表

#### 表：dashboard.help_texts（帮助文本表）

```sql
CREATE TABLE dashboard.help_texts (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL, -- 如 'permission.ban_user.tooltip'
  short_text JSONB NOT NULL, -- {"zh-CN": "封禁用户", "en": "Ban user"}
  tooltip_text JSONB, -- {"zh-CN": "对违规用户执行封禁操作，可选禁言、软封禁或硬封禁", "en": "..."}
  doc_link VARCHAR(255), -- 可选的内部文档链接 '/docs/user-management#banning'
  updated_by INT,
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (updated_by) REFERENCES dashboard.admin_users(id)
);

-- 插入示例
INSERT INTO dashboard.help_texts (key, short_text, tooltip_text, doc_link) VALUES
  ('permission.ban_user.tooltip', 
   '{"zh-CN": "封禁用户", "en": "Ban User"}',
   '{"zh-CN": "对违规用户执行封禁操作，包括禁言（限制发言）、软封禁（限制大部分功能）和硬封禁（强制断开连接）", "en": "Ban violating users, including silence (restrict messaging), soft ban (restrict most features), and hard ban (force disconnect)"}',
   '/docs/moderation#banning-users');
```

### 2.5 黑名单表（补充）

#### 表：dashboard.blacklist_actions（黑名单操作记录表）

```sql
-- 记录对黑名单的所有操作（添加、修改、删除）
CREATE TABLE dashboard.blacklist_actions (
  id SERIAL PRIMARY KEY,
  blacklist_id INT NOT NULL, -- 关联到 registration_blacklist 或其他黑名单表
  action_type VARCHAR(20) NOT NULL, -- add/modify/delete
  admin_id INT NOT NULL,
  admin_level INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending/cooldown/effective/overridden
  cooldown_end_at TIMESTAMP, -- 7天冷却期
  effective_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (blacklist_id) REFERENCES dashboard.registration_blacklist(id),
  FOREIGN KEY (admin_id) REFERENCES dashboard.admin_users(id)
);

-- 黑名单操作同样遵循冷却期和权限规则
-- 超管：立即生效
-- 管理员：可修改+添加，7天冷却期
-- 小管：只能添加，7天冷却期
```

---

## 3. 后端监控页面设计

### 3.1 访问方式

- **URL**: `http://[内网IP]:3001/monitor`
- **权限**: 完全公开（内网），无需登录
- **技术**: 纯静态HTML页面 + JavaScript轮询API
- **刷新频率**: 每5秒自动刷新数据

### 3.2 页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  Matrix System Monitor                    [实时更新: 5秒前]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐│
│  │ CPU 使用率      │  │ 内存使用        │  │ 磁盘使用     ││
│  │                 │  │                 │  │              ││
│  │     45.3%       │  │   6.2 / 16 GB   │  │  120 / 500 GB││
│  │  ████████░░░░   │  │  ███████░░░░░   │  │  ██████░░░░░ ││
│  └─────────────────┘  └─────────────────┘  └──────────────┘│
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐│
│  │ GPU 使用率      │  │ 网络流量        │  │ 服务状态     ││
│  │                 │  │                 │  │              ││
│  │     12.8%       │  │  ↑ 25 MB/s      │  │ Synapse  ✓   ││
│  │  ███░░░░░░░░░   │  │  ↓ 18 MB/s      │  │ Dashboard ✓  ││
│  └─────────────────┘  └─────────────────┘  │ PostgreSQL ✓ ││
│                                             │ Redis      ✓ ││
│  ┌───────────────────────────────────────┐ │ MinIO      ✓ ││
│  │ 数据库连接池状态                      │ └──────────────┘│
│  │ - 总连接数: 15 / 20                   │                  │
│  │ - 活跃连接: 8                         │  ┌──────────────┐│
│  │ - 空闲连接: 7                         │  │ 快速统计     ││
│  │ - 等待连接: 0                         │  │              ││
│  └───────────────────────────────────────┘  │ 在线用户: 342││
│                                              │ 今日消息:1.2K││
│  ┌───────────────────────────────────────┐  │ 活跃房间: 58 ││
│  │ Redis 缓存状态                        │  │ 待处理申诉:3 ││
│  │ - 已用内存: 245 MB                    │  └──────────────┘│
│  │ - 命中率: 96.3%                       │                  │
│  │ - 键数量: 3,247                       │                  │
│  └───────────────────────────────────────┘                  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 最近错误日志 (最近1小时)                             │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 14:32:15  [WARN]  Database query slow: 1.2s          │  │
│  │ 14:28:03  [ERROR] Redis connection timeout           │  │
│  │ 14:15:42  [WARN]  High memory usage: 92%             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 系统信息                                              │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ 操作系统: Ubuntu Server 22.04 LTS                     │  │
│  │ 运行时间: 15 天 7 小时 32 分钟                        │  │
│  │ Synapse 版本: v1.98.0                                 │  │
│  │ Dashboard 版本: v1.0.0                                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 数据项定义

#### CPU 使用率
- **数据源**: `os.cpus()` (Node.js) 或 `/proc/stat` (Linux)
- **显示**: 百分比 + 进度条
- **阈值告警**: >80% 显示红色

#### 内存使用
- **数据源**: `os.totalmem()` / `os.freemem()`
- **显示**: 已用/总量 (GB) + 进度条
- **阈值告警**: >90% 显示红色

#### 磁盘使用
- **数据源**: `df -h` 命令或 `diskusage` 库
- **显示**: 已用/总量 (GB) + 进度条
- **监控路径**: `/` (根分区)

#### GPU 使用率
- **数据源**: `nvidia-smi` (如果有GPU)
- **显示**: 百分比 + 进度条
- **无GPU时**: 显示 "N/A"

#### 网络流量
- **数据源**: `/proc/net/dev` 或 `netstat`
- **显示**: 上行/下行速率 (MB/s)
- **计算方式**: 每5秒采样一次，计算差值

#### 服务状态
检查以下服务是否运行：
- **Synapse**: 检查端口8008是否响应
- **Dashboard**: 检查端口3000是否响应
- **PostgreSQL**: 尝试连接数据库
- **Redis**: `redis.ping()`
- **MinIO**: 检查端口9000是否响应

状态显示：
- ✓ (绿色): 正常运行
- ✗ (红色): 服务异常
- ⚠ (黄色): 响应缓慢

#### 数据库连接池状态
- **数据源**: `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`
- **显示**: 当前使用情况和等待队列

#### Redis 缓存状态
- **数据源**: `redis.info('memory')`, `redis.info('stats')`
- **显示**: 内存使用、命中率、键数量

#### 快速统计
- **在线用户**: 查询当前活跃连接数（Synapse API）
- **今日消息**: 查询今日消息总数（数据库）
- **活跃房间**: 查询最近1小时有消息的房间数
- **待处理申诉**: 查询 `status='pending'` 的申诉数

#### 最近错误日志
- **数据源**: 读取 `logs/error.log` 最后50行
- **显示**: 时间戳 + 日志级别 + 消息
- **过滤**: 只显示 WARN 和 ERROR 级别

### 3.4 实现示例（伪代码）

```javascript
// backend-monitor/server.js
const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const { pool } = require('../dashboard/src/config/database');
const redis = require('../dashboard/src/config/redis');

const app = express();

app.get('/api/system-status', async (req, res) => {
  try {
    const status = {
      cpu: getCPUUsage(),
      memory: getMemoryUsage(),
      disk: await getDiskUsage(),
      gpu: await getGPUUsage(),
      network: await getNetworkTraffic(),
      services: await checkServices(),
      database: await getDatabasePoolStatus(),
      redis: await getRedisStatus(),
      stats: await getQuickStats(),
      errors: await getRecentErrors(),
      system: getSystemInfo()
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getCPUUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  
  cpus.forEach(cpu => {
    for (type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);
  
  return { percentage: usage, cores: cpus.length };
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  
  return {
    total: (total / 1024 / 1024 / 1024).toFixed(2), // GB
    used: (used / 1024 / 1024 / 1024).toFixed(2),
    percentage: ((used / total) * 100).toFixed(1)
  };
}

async function getDiskUsage() {
  return new Promise((resolve, reject) => {
    exec('df -h /', (error, stdout) => {
      if (error) return reject(error);
      
      const lines = stdout.split('\n');
      const data = lines[1].split(/\s+/);
      
      resolve({
        total: data[1],
        used: data[2],
        percentage: parseInt(data[4])
      });
    });
  });
}

async function getGPUUsage() {
  try {
    const result = await execPromise('nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits');
    return { percentage: parseInt(result.trim()) };
  } catch (error) {
    return { percentage: null }; // 无GPU
  }
}

async function checkServices() {
  return {
    synapse: await checkPort(8008),
    dashboard: await checkPort(3000),
    postgres: await checkDatabase(),
    redis: await checkRedis(),
    minio: await checkPort(9000)
  };
}

async function checkPort(port) {
  try {
    const response = await fetch(`http://localhost:${port}/`, { timeout: 2000 });
    return { status: 'ok', responseTime: response.time };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

async function getDatabasePoolStatus() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    active: pool.totalCount - pool.idleCount,
    waiting: pool.waitingCount
  };
}

async function getRedisStatus() {
  const info = await redis.info('memory');
  const stats = await redis.info('stats');
  
  return {
    memoryUsed: parseRedisInfo(info, 'used_memory_human'),
    hitRate: calculateHitRate(stats),
    keys: await redis.dbsize()
  };
}

app.use(express.static('public')); // 提供静态HTML页面
app.listen(3001, () => console.log('Monitor running on :3001'));
```

---

## 4. 前端 Dashboard 详细设计

### 4.1 整体色彩方案设计（参考 Cloudflare）

#### 默认深色主题

```css
/* 主色板 */
--color-background: #1a1a1a;        /* 主背景 */
--color-surface: #242424;           /* 卡片/面板背景 */
--color-surface-hover: #2e2e2e;     /* 悬停状态 */
--color-border: #3a3a3a;            /* 边框 */

/* 文本颜色 */
--color-text-primary: #ffffff;       /* 主要文本 */
--color-text-secondary: #a0a0a0;     /* 次要文本 */
--color-text-tertiary: #6a6a6a;      /* 三级文本 */

/* 品牌色（可自定义） */
--color-primary: #3b82f6;            /* 主品牌色-蓝色 */
--color-primary-hover: #2563eb;      
--color-accent: #f59e0b;             /* 强调色-橙色 */
--color-accent-hover: #d97706;

/* 功能色 */
--color-success: #10b981;            /* 成功-绿色 */
--color-warning: #f59e0b;            /* 警告-黄色 */
--color-danger: #ef4444;             /* 危险-红色 */
--color-info: #3b82f6;               /* 信息-蓝色 */

/* 阴影 */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
--shadow-md: 0 4px 6px rgba(0,0,0,0.4);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.5);

/* 圆角 */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;

/* 过渡动画 */
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
--transition-slow: 350ms ease;
```

#### 可选浅色主题

```css
[data-theme="light"] {
  --color-background: #f9fafb;
  --color-surface: #ffffff;
  --color-surface-hover: #f3f4f6;
  --color-border: #e5e7eb;
  
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  
  /* 品牌色保持不变，但可调整透明度 */
}
```

### 4.2 登录界面设计

#### 布局结构

```
┌───────────────────────────────────────────────────────────┐
│                                                             │
│                         (居中)                              │
│                                                             │
│              ┌─────────────────────────────┐               │
│              │                             │               │
│              │    [Matrix Logo]            │               │
│              │                             │               │
│              │    Dashboard 管理面板        │               │
│              │                             │               │
│              │  ┌───────────────────────┐  │               │
│              │  │ 用户名                │  │               │
│              │  │ [__________________] │  │               │
│              │  └───────────────────────┘  │               │
│              │                             │               │
│              │  ┌───────────────────────┐  │               │
│              │  │ 密码                  │  │               │
│              │  │ [__________________] │  │               │
│              │  └───────────────────────┘  │               │
│              │                             │               │
│              │  [ ] 记住我                 │               │
│              │                             │               │
│              │  ┌───────────────────────┐  │               │
│              │  │       登  录          │  │               │
│              │  └───────────────────────┘  │               │
│              │                             │               │
│              │  忘记密码？联系超级管理员    │               │
│              │                             │               │
│              └─────────────────────────────┘               │
│                                                             │
│                                                             │
│                                                             │
│              Dashboard v1.0.0 | © 2025                     │
└───────────────────────────────────────────────────────────┘
```

#### 设计细节

- **卡片阴影**: 使用 `--shadow-lg` 创建悬浮效果
- **输入框**: 深色背景 + 细边框，聚焦时边框变为主品牌色
- **登录按钮**: 全宽，使用主品牌色，悬停时稍微变暗
- **动画**: 卡片淡入 + 轻微上浮动画（300ms）
- **错误提示**: 在输入框下方显示红色错误消息

#### 安全特性

- 登录失败3次后显示验证码（使用 Cloudflare Turnstile）
- 登录失败5次后锁定账户15分钟
- 显示上次登录时间和IP（登录成功后）

### 4.3 主仪表盘（Dashboard Home）

#### 页面布局

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Logo] Matrix Dashboard    [🔔通知] [👤 管理员名称 ▼] [🌐 语言 ▼] │
├─────┬───────────────────────────────────────────────────────────────┤
│     │                                                                 │
│  侧  │  概览 Overview                          最后更新: 2分钟前 ↻    │
│  边  │                                                                 │
│  导  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────┐ │
│  航  │  │ 在线用户     │ │ 今日新增用户 │ │ 待处理申诉   │ │存储  │ │
│  栏  │  │              │ │              │ │              │ │使用  │ │
│     │  │    342       │ │     28       │ │      3       │ │      │ │
│  📊  │  │  ↑ 12.3%    │ │  ↓ 5.2%     │ │  ⚠ 需处理   │ │ 45%  │ │
│  概览│  └──────────────┘ └──────────────┘ └──────────────┘ └──────┘ │
│     │                                                                 │
│  👥  │  ┌───────────────────────────────────────────────────────────┐│
│  成员│  │ 用户活跃度趋势 (最近7天)                                 ││
│  管理│  │                                                           ││
│     │  │  [折线图: 显示每天的活跃用户数趋势]                      ││
│  ⚖️  │  │                                                           ││
│  申诉│  │  周一  周二  周三  周四  周五  周六  周日               ││
│  处理│  │   320   342   358   310   295   280   342               ││
│     │  └───────────────────────────────────────────────────────────┘│
│  👮  │                                                                 │
│  管理│  ┌─────────────────────┐  ┌────────────────────────────────┐  │
│  员组│  │ 用户组分布           │  │ 存储使用分析                   │  │
│     │  │                     │  │                                │  │
│  ⚙️  │  │  [饼状图]           │  │  [堆叠条状图]                  │  │
│  设置│  │                     │  │                                │  │
│     │  │  免费: 1,234 (65%)  │  │  视频: 45GB                    │  │
│  📄  │  │  普通: 432 (23%)    │  │  图片: 28GB                    │  │
│  日志│  │  高级: 186 (10%)    │  │  文件: 15GB                    │  │
│     │  │  企业: 38 (2%)      │  │  文本: 2GB                     │  │
│  🚪  │  └─────────────────────┘  └────────────────────────────────┘  │
│  登出│                                                                 │
│     │  ┌───────────────────────────────────────────────────────────┐│
└─────┤  │ 待处理事项                                 [查看全部 →]   ││
      │  ├───────────────────────────────────────────────────────────┤│
      │  │ ⚠ 3个申诉需要在48小时内处理                              ││
      │  │ 📝 15个注册申请等待审核                                   ││
      │  │ 🚫 2个举报等待处理（仅超管可见）                          ││
      │  └───────────────────────────────────────────────────────────┘│
      └─────────────────────────────────────────────────────────────────┘
```

#### 侧边导航栏设计

```css
/* 侧边栏宽度: 240px */
.sidebar {
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  height: 100vh;
  position: fixed;
  width: 240px;
}

.sidebar-item {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  border-left: 3px solid transparent;
}

.sidebar-item:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.sidebar-item.active {
  background: var(--color-surface-hover);
  color: var(--color-primary);
  border-left-color: var(--color-primary);
}

.sidebar-icon {
  font-size: 20px;
  width: 24px;
}
```

#### 图表库选择

使用 **Recharts** 或 **Chart.js** 实现可视化：

```typescript
// 用户活跃度折线图示例
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { day: '周一', users: 320 },
  { day: '周二', users: 342 },
  { day: '周三', users: 358 },
  // ...
];

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
    <XAxis dataKey="day" stroke="var(--color-text-secondary)" />
    <YAxis stroke="var(--color-text-secondary)" />
    <Tooltip
      contentStyle={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)'
      }}
    />
    <Line 
      type="monotone" 
      dataKey="users" 
      stroke="var(--color-primary)" 
      strokeWidth={2}
      dot={{ fill: 'var(--color-primary)', r: 4 }}
      activeDot={{ r: 6 }}
    />
  </LineChart>
</ResponsiveContainer>
```

### 4.4 成员管理界面

#### 主界面布局
```
┌─────────────────────────────────────────────────────────────────────┐
│ 成员管理                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [注册申请管理] [已注册用户] [黑名单管理]                           │
│  ━━━━━━━━━━━━━━                                                      │
│                                                                       │
│  注册申请管理                                                        │
│                                                                       │
│  筛选: [全部 ▼] [等待审核 ▼] [已批准 ▼] [已拒绝 ▼]  🔍 [搜索...]  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户名     │ 邮箱              │ IP地址      │ 状态  │ 操作   │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ alice123   │ alice@example.com │ 192.168.1.5 │ 待审核│ [详情] │  │
│  │ bob_smith  │ bob@test.org      │ 192.168.1.8 │ 待审核│ [详情] │  │
│  │ charlie_w  │ charlie@mail.com  │ 192.168.1.12│ 已批准│ [查看] │  │
│  │ ...                                                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  第1页 / 共5页  [<] [1] [2] [3] ... [>]                            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

点击 [详情] 后弹出侧边抽屉:

┌────────────────────────────────┐
│ 注册申请详情          [× 关闭] │
├────────────────────────────────┤
│                                │
│  用户名: alice123              │
│  邮箱: alice@example.com       │
│  电话: +86 138****5678         │
│  注册IP: 192.168.1.5           │
│  设备指纹: abc123def...        │
│  申请时间: 2025-01-15 14:32   │
│                                │
│  IP 纯净度分析:                │
│  ├─ IP 类型: 家庭宽带          │
│  ├─ 地理位置: 浙江省杭州市      │
│  ├─ 风险评分: 低风险 (15/100) │
│  └─ 黑名单: 未发现             │
│                                │
│  设备指纹分析:                 │
│  ├─ 首次出现: 是               │
│  ├─ 关联账户: 0                │
│  └─ 可信度: 高                 │
│                                │
│  ┌──────────────────────────┐  │
│  │ 批准理由 (可选)          │  │
│  │ [____________________]   │  │
│  └──────────────────────────┘  │
│                                │
│  [✓ 批准申请] [✗ 拒绝申请]    │
│                                │
│  ⚠ 拒绝后将加入黑名单          │
│                                │
└────────────────────────────────┘
```

#### Tab 2: 已注册用户

```
┌─────────────────────────────────────────────────────────────────────┐
│ 成员管理                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [注册申请管理] [已注册用户] [黑名单管理]                           │
│                  ━━━━━━━━━━━━                                        │
│                                                                       │
│  已注册用户检索                                                      │
│                                                                       │
│  🔍 搜索用户: [________________________] [搜索]                     │
│     支持: 用户名、邮箱、用户ID、Matrix ID                           │
│                                                                       │
│  快捷筛选:                                                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │ 系统账户(5) │ │ 待处理(12)  │ │ 已处理(48)  │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
│                                                                       │
│  系统账户列表:                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Matrix ID          │ 昵称      │ 状态   │ 标记人  │ 操作      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ @test1:example.com │ 测试账号1 │ 活跃   │ 超管A   │ [管理]    │  │
│  │ @test2:example.com │ 测试账号2 │ 活跃   │ 超管A   │ [管理]    │  │
│  │ @bot_test:...      │ Bot测试   │ 离线   │ 管理员B │ [管理]    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  待处理用户 (有申诉或操作待生效):                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户      │ 当前状态   │ 待处理操作      │ 冷却期剩余│ 操作   │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ alice123  │ 禁言中     │ 管理员A:解封    │ 1天2小时  │ [详情] │  │
│  │ bob_smith │ 正常       │ 小管B:禁言3天   │ 2天8小时  │ [详情] │  │
│  │ charlie_w │ 软封禁中   │ 管理员C:硬封禁  │ 需仲裁    │ [详情] │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

搜索后显示结果:

┌─────────────────────────────────────────────────────────────────────┐
│  搜索结果: "alice"                                   [清除搜索]      │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Matrix ID           │ 昵称   │ 用户组│ 状态    │ 操作         │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ @alice123:ex.com    │ Alice  │ 普通  │ 禁言中  │ [详情][封禁] │  │
│  │ @alice_wang:ex.com  │ 小艾   │ 免费  │ 正常    │ [详情][封禁] │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### Tab 3: 黑名单管理

```
┌─────────────────────────────────────────────────────────────────────┐
│ 成员管理                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [注册申请管理] [已注册用户] [黑名单管理]                           │
│                                  ━━━━━━━━━━━━                        │
│                                                                       │
│  黑名单管理                                [+ 手动添加]               │
│                                                                       │
│  [注册黑名单] [已注册用户黑名单]                                    │
│   ━━━━━━━━━━━                                                        │
│                                                                       │
│  注册黑名单                                                          │
│                                                                       │
│  筛选: [全部类型 ▼] [永久 ▼]                                        │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 类型   │ 值                │ 原因      │ 到期时间  │ 操作      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ 邮箱   │ spam@test.com     │ 垃圾注册  │ 永久      │ [放行][删]│  │
│  │ IP     │ 203.0.113.5       │ 恶意扫描  │ 2025-02-01│ [放行][删]│  │
│  │ 设备ID │ abc123def...      │ 批量注册  │ 永久      │ [放行][删]│  │
│  │ 用户名 │ admin             │ 保留名称  │ 永久      │ [放行][删]│  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  已注册用户黑名单:                                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户      │ 违规原因         │ 处罚       │ 到期      │ 操作   │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ baduser1  │ 发布违规内容     │ 硬封禁     │ 2025-03-01│ [详情] │  │
│  │ spammer2  │ 批量发送广告     │ 永久软封禁 │ 永久      │ [详情] │  │
│  │ hacker3   │ 尝试攻击系统     │ 软删除     │ 已删除    │ [详情] │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ⚠ 注意: 修改黑名单需要7天冷却期（超级管理员除外）                  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.5 申诉处理界面

```
┌─────────────────────────────────────────────────────────────────────┐
│ 申诉处理                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  筛选: [待处理 ▼] [处理中 ▼] [已解决 ▼]     🔍 [搜索用户...]      │
│                                                                       │
│  ⚠ 3个申诉即将超时（48小时内必须处理）                              │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 申诉ID │ 用户     │ 当前处罚   │ 提交时间  │ 剩余时间│ 操作   │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ #1523  │ alice123 │ 禁言24小时 │ 1小时前   │ 47小时  │ [处理] │  │
│  │ #1522  │ bob_test │ 软封禁7天  │ 3小时前   │ 45小时  │ [处理] │  │
│  │ #1521  │ charlie  │ 硬封禁30天 │ 12小时前  │ 36小时  │ [处理] │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

点击 [处理] 进入详情页:

┌─────────────────────────────────────────────────────────────────────┐
│ 申诉详情 #1523                                          [返回列表]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  基本信息:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户: alice123 (@alice123:example.com)                        │  │
│  │ 用户组: 普通用户                                              │  │
│  │ 当前处罚: 禁言24小时                                          │  │
│  │ 执行人: 小管A (准确率: 87.5%)                                │  │
│  │ 处罚原因: "在公共房间发送不当言论"                           │  │
│  │ 处罚时间: 2025-01-15 10:30                                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  申诉内容:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 联系邮箱: alice@personal.com                                  │  │
│  │ 申诉理由: "我认为这次封禁是误判，当时我只是在讨论一个技术    │  │
│  │           话题，并没有恶意。"                                 │  │
│  │ 事情经过: "我在 #tech-discussion 房间里讨论了关于XXX的技术   │  │
│  │           实现，可能用词不当被误解了。我愿意道歉并注意措辞。" │  │
│  │ 提交时间: 2025-01-15 11:45                                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  历史处罚记录:                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 2024-12-01  禁言8小时    (小管B)  - 发送垃圾信息              │  │
│  │ 2024-10-15  警告         (管理员A) - 多次违反房间规则         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  其他管理员的处理意见:                                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 暂无其他管理员处理                                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  我的处理决定:                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 处理方式: [保持原处罚 ▼] [修改处罚 ▼] [立即解封 ▼]           │  │
│  │                                                                 │  │
│  │ (若选择"修改处罚")                                             │  │
│  │ 新处罚类型: [禁言 ▼] [软封禁 ▼] [硬封禁 ▼]                    │  │
│  │ 时长: [___] 小时  或  [___] 天  或  [永久]                    │  │
│  │                                                                 │  │
│  │ 处理理由:                                                       │  │
│  │ [_____________________________________________________________] │  │
│  │ [_____________________________________________________________] │  │
│  │                                                                 │  │
│  │ 严重度评分预览: 12.4分 (原处罚: 12.4分, 差异: 0分)            │  │
│  │ 预计生效时间: 3天后 (2025-01-18 14:30)                        │  │
│  │                                                                 │  │
│  │ ⚠ 提示:                                                         │  │
│  │ - 您的处理将在3天冷却期后生效                                  │  │
│  │ - 如果其他同级管理员修改您的决定，您将收到通知                │  │
│  │ - 您的决定将影响您的准确率评分                                │  │
│  │                                                                 │  │
│  │ [✓ 提交处理] [暂存草稿]                                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### 冷却期和多级审核的可视化展示

当一个申诉被多个管理员处理后：

```
┌─────────────────────────────────────────────────────────────────────┐
│  其他管理员的处理意见: (需要仲裁)                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                                 │  │
│  │  处理时间线:                                                    │  │
│  │                                                                 │  │
│  │  ① 小管A 处理 (2025-01-15 10:30)                               │  │
│  │     └─ 禁言24小时 (严重度: 12.4分)                             │  │
│  │        └─ 状态: 已生效                                          │  │
│  │                                                                 │  │
│  │  ② 管理员B 修改 (2025-01-16 09:15) - 冷却期重置                │  │
│  │     └─ 禁言10天 (严重度: 34分)                                 │  │
│  │        └─ 状态: 冷却中 (剩余2天1小时)                          │  │
│  │                                                                 │  │
│  │  ③ 管理员C 修改 (2025-01-16 14:30) - 差异过大，需仲裁          │  │
│  │     └─ 软封禁15天 (严重度: 48分)                               │  │
│  │        └─ 状态: 等待第3位管理员或超管                          │  │
│  │                                                                 │  │
│  │  ⚠ 管理员B和C的决定差异较大 (评分差14分)                       │  │
│  │  需要您或其他管理员/超管介入仲裁                               │  │
│  │                                                                 │  │
│  │  如果您现在处理:                                                │  │
│  │  - 最终结果将基于B和C的处理进行加权计算                        │  │
│  │  - 您的准确率将根据与最终结果的差异评分                        │  │
│  │                                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.6 管理员分组界面（仅上级可见）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 管理员分组                                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  当前层级: 超级管理员                             [+ 创建管理员]    │
│                                                                       │
│  [管理员列表] [角色配置] [举报记录]                                 │
│   ━━━━━━━━━━━                                                        │
│                                                                       │
│  管理员列表                                                          │
│                                                                       │
│  筛选: [所有等级 ▼] [活跃 ▼]                                        │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户名   │ 昵称     │ 角色│ 状态  │ 准确率│ 处理数│ 操作      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ admin_a  │ 管理员A  │ 2级 │ 在线  │ 92.3% │ 1,234 │ [管理]    │  │
│  │ admin_b  │ 管理员B  │ 2级 │ 离线  │ 88.7% │ 856   │ [管理]    │  │
│  │ mod_1    │ 小管一号 │ 3级 │ 在线  │ 85.1% │ 432   │ [管理]    │  │
│  │ mod_2    │ 小管二号 │ 3级 │ 暂停中│ 76.5% │ 298   │ [管理]    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

点击 [管理] 进入管理员详情:

┌─────────────────────────────────────────────────────────────────────┐
│ 管理员详情: admin_a                                     [返回列表]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [基本信息] [权限配置] [操作记录] [统计数据]                        │
│   ━━━━━━━━━                                                          │
│                                                                       │
│  基本信息:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户名: admin_a                                               │  │
│  │ 昵称: 管理员A                                                 │  │
│  │ 角色: 管理员 (Level 2)                                        │  │
│  │ 创建者: superadmin                                            │  │
│  │ 创建时间: 2024-06-01 10:30                                   │  │
│  │ 最后登录: 2025-01-15 14:25 (192.168.1.10)                   │  │
│  │ 状态: 活跃                                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  权限配置:                                    [修改权限上限]         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                                 │  │
│  │  系统权限:                                                      │  │
│  │  ☐ 修改基础配置 (仅超管)                                       │  │
│  │  ☐ 管理管理员角色 (仅超管)                                     │  │
│  │                                                                 │  │
│  │  管理员管理:                                                    │  │
│  │  ☑ 创建下级管理员 (小管)                                       │  │
│  │  ☑ 修改下级管理员权限                                          │  │
│  │  ☑ 查看下级管理员列表                                          │  │
│  │  ☑ 暂停下级管理员                                              │  │
│  │                                                                 │  │
│  │  用户管理:                                                      │  │
│  │  ☑ 审核注册                                                    │  │
│  │  ☑ 封禁用户                                                    │  │
│  │  ☑ 解封用户                                                    │  │
│  │  ☑ 修改用户组                                                  │  │
│  │  ☑ 添加黑名单                                                  │  │
│  │  ☑ 修改黑名单                                                  │  │
│  │  ☐ 删除黑名单 (仅超管)                                         │  │
│  │                                                                 │  │
│  │  申诉处理:                                                      │  │
│  │  ☑ 处理申诉                                                    │  │
│  │  ☑ 查看申诉                                                    │  │
│  │                                                                 │  │
│  │  Bot 管理:                                                      │  │
│  │  ☐ 发送Bot消息 (仅超管和管理员)                                │  │
│  │                                                                 │  │
│  │  [保存更改] [重置为默认]                                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  统计数据:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 总操作次数: 1,234                                             │  │
│  │ 处理申诉: 456                                                 │  │
│  │ 审核注册: 342                                                 │  │
│  │ 封禁用户: 189                                                 │  │
│  │ 准确率: 92.3%                                                 │  │
│  │ 平均响应时间: 2.3小时                                         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  操作按钮:                                                           │
│  [重置密码] [暂停权限] [删除账户]                                   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### Tab 2: 角色配置（仅超级管理员）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 管理员分组                                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [管理员列表] [角色配置] [举报记录]                                 │
│                 ━━━━━━━━━━                                          │
│                                                                       │
│  角色配置                                          [+ 创建新角色]    │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 角色名称      │ 等级 │ 成员数 │ 描述              │ 操作      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ 超级管理员    │  1   │   1    │ 拥有全部权限      │ [查看]    │  │
│  │ 管理员        │  2   │   2    │ 管理下级和用户    │ [编辑]    │  │
│  │ 小管          │  3   │   4    │ 处理申诉和封禁    │ [编辑]    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  点击 [编辑] 进入角色权限配置:                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 编辑角色: 管理员                                              │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │                                                                 │  │
│  │  角色名称: [管理员______]                                      │  │
│  │  等级: [2]                                                     │  │
│  │  显示名称 (多语言):                                            │  │
│  │    简体中文: [管理员_____]                                     │  │
│  │    English:  [Administrator___]                               │  │
│  │    日本語:   [管理者_____]                                     │  │
│  │                                                                 │  │
│  │  默认权限: (新创建的管理员将拥有这些权限)                      │  │
│  │  [选择权限... 与上面的权限复选框类似]                          │  │
│  │                                                                 │  │
│  │  可管理的下级角色:                                              │  │
│  │  ☑ 小管 (Level 3)                                              │  │
│  │                                                                 │  │
│  │  [保存] [取消]                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### Tab 3: 举报记录（仅超级管理员）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 管理员分组                                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [管理员列表] [角色配置] [举报记录]                                 │
│                             ━━━━━━━━━━                              │
│                                                                       │
│  举报记录                                                            │
│                                                                       │
│  筛选: [待处理 ▼] [已处理 ▼]                                        │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 举报ID │ 举报人  │ 被举报人│ 类型       │ 状态  │ 操作      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ #R-001 │ 匿名    │ mod_2   │ 滥用权力   │ 待处理│ [处理]    │  │
│  │ #R-002 │ admin_a │ mod_3   │ 判断不当   │ 待处理│ [处理]    │  │
│  │ #R-003 │ mod_1   │ admin_b │ 不当行为   │ 已处理│ [查看]    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

点击 [处理] 进入举报详情:

┌─────────────────────────────────────────────────────────────────────┐
│ 举报详情 #R-001                                         [返回列表]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  举报信息:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 举报人: 匿名 (同级管理员)                                      │  │
│  │ 被举报人: mod_2 (小管)                                         │  │
│  │ 举报类型: 滥用权力                                             │  │
│  │ 举报时间: 2025-01-14 16:45                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  举报理由:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ "mod_2 多次在没有充分理由的情况下对用户执行硬封禁，导致多个  │  │
│  │  合法用户被误封。我认为他滥用了权力，需要审查。"              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  相关证据文件:                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 📎 evidence_01.png (查看)                                      │  │
│  │ 📎 evidence_02.pdf (查看)                                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  相关操作记录: (系统自动关联)                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 2025-01-10  mod_2 对用户 user_123 执行硬封禁30天              │  │
│  │ 2025-01-12  mod_2 对用户 user_456 执行硬封禁15天              │  │
│  │ 2025-01-13  mod_2 对用户 user_789 执行硬封禁7天               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  处理措施:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 处理决定: [驳回举报 ▼] [警告 ▼] [暂停权限 ▼] [其他 ▼]        │  │
│  │                                                                 │  │
│  │ (若选择"暂停权限")                                             │  │
│  │ 暂停时长: [__] 天                                              │  │
│  │ 暂停权限: ☑ 封禁用户  ☑ 处理申诉  ☐ 审核注册                  │  │
│  │                                                                 │  │
│  │ 处理说明:                                                       │  │
│  │ [_____________________________________________________________] │  │
│  │ [_____________________________________________________________] │  │
│  │                                                                 │  │
│  │ 是否通知被举报人: ☑ 是  ☐ 否                                  │  │
│  │ 是否通知举报人结果: ☑ 是  ☐ 否                                │  │
│  │                                                                 │  │
│  │ [提交处理] [暂存]                                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.7 个人设置界面

```
┌─────────────────────────────────────────────────────────────────────┐
│ 个人设置                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [账户信息] [外观设置] [通知设置] [安全设置]                        │
│   ━━━━━━━━━                                                          │
│                                                                       │
│  账户信息:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户名: superadmin (不可修改)                                  │  │
│  │ 昵称: [超级管理员___________]                                  │  │
│  │ 角色: 超级管理员 (Level 1)                                     │  │
│  │ 加入时间: 2024-06-01 10:30                                    │  │
│  │ 最后登录: 2025-01-15 14:25 (192.168.1.10)                    │  │
│  │                                                                 │  │
│  │ [修改密码] [更新信息]                                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

Tab 2: 外观设置

┌─────────────────────────────────────────────────────────────────────┐
│  [账户信息] [外观设置] [通知设置] [安全设置]                        │
│               ━━━━━━━━━                                              │
│                                                                       │
│  语言设置:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 界面语言: [简体中文 ▼]                                         │  │
│  │                                                                 │  │
│  │ 可选语言:                                                       │  │
│  │ • 简体中文 (Simplified Chinese)                                │  │
│  │ • English (英语)                                                │  │
│  │ • 繁體中文 (Traditional Chinese)                               │  │
│  │ • 日本語 (Japanese)                                            │  │
│  │ • 한국어 (Korean)                                              │  │
│  │ • Esperanto (世界语)                                           │  │
│  │ • ... (更多语言)                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  主题设置:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 主题模式: ◉ 深色  ○ 浅色  ○ 自动 (跟随系统)                   │  │
│  │                                                                 │  │
│  │ 自定义颜色:                                                     │  │
│  │                                                                 │  │
│  │  主品牌色:  [■ #3b82f6] ← 蓝色                                │  │
│  │            ┌─────────────────────────────────┐                 │  │
│  │  预设:     │ ■蓝色 ■绿色 ■紫色 ■橙色 ■红色  │                 │  │
│  │            └─────────────────────────────────┘                 │  │
│  │                                                                 │  │
│  │  强调色:    [■ #f59e0b] ← 橙色                                │  │
│  │            ┌─────────────────────────────────┐                 │  │
│  │  预设:     │ ■橙色 ■黄色 ■粉色 ■青色 ■紫色  │                 │  │
│  │            └─────────────────────────────────┘                 │  │
│  │                                                                 │  │
│  │  预览:                                                          │  │
│  │  ┌───────────────────────────────────────────┐                 │  │
│  │  │ [按钮示例] <链接示例> 【卡片示例】        │                 │  │
│  │  └───────────────────────────────────────────┘                 │  │
│  │                                                                 │  │
│  │ [保存设置] [重置为默认]                                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  显示设置:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ☑ 显示动画效果                                                 │  │
│  │ ☑ 显示辅助提示 (悬停时显示说明)                                │  │
│  │ ☐ 紧凑模式 (减少界面间距)                                      │  │
│  │ ☑ 显示通知气泡                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.8 系统配置界面（仅超级管理员）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 系统配置                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ⚠ 此页面仅超级管理员可见                                           │
│                                                                       │
│  [基础配置] [用户组配置] [严重度配置] [帮助文本管理]               │
│   ━━━━━━━━━                                                          │
│                                                                       │
│  基础配置:                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 注册设置:                                                       │  │
│  │  注册模式: ◉ 开启自动注册  ○ 关闭自动注册                     │  │
│  │  验证方式: ☑ 邮箱验证  ☐ 手机号验证                            │  │
│  │  人机验证: ☑ 启用 Cloudflare Turnstile                         │  │
│  │                                                                 │  │
│  │ 存储设置:                                                       │  │
│  │  ☑ 允许终端记录非文本内容                                      │  │
│  │  文件冷却期: 默认 [7] 天                                       │  │
│  │  MinIO 连接: [配置...]                                         │  │
│  │                                                                 │  │
│  │ AI 服务设置:                                                    │  │
│  │  ☑ 接入 AI 服务到客户端                                        │  │
│  │  接入服务:                                                      │  │
│  │    ☑ OCR 识别服务                                              │  │
│  │    ☑ PDF 转 Markdown                                           │  │
│  │    ☐ 图像生成 (未启用)                                         │  │
│  │    ☐ 语音识别 (未启用)                                         │  │
│  │                                                                 │  │
│  │ 黑名单设置:                                                     │  │
│  │  ☑ 黑名单撤销后发送邮件提醒                                    │  │
│  │  冷却期: [7] 天                                                │  │
│  │                                                                 │  │
│  │ Bot 设置:                                                       │  │
│  │  Bot 用户名: @admin_bot:example.com                            │  │
│  │  ☑ 自动添加到新用户联系人                                      │  │
│  │  ☑ 允许用户屏蔽 Bot                                            │  │
│  │                                                                 │  │
│  │ [保存配置] [重置为默认]                                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

Tab 2: 用户组配置

┌─────────────────────────────────────────────────────────────────────┐
│  [基础配置] [用户组配置] [严重度配置] [帮助文本管理]               │
│               ━━━━━━━━━━━                                            │
│                                                                       │
│  用户组配置:                                        [+ 创建新用户组] │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 用户组   │ 成员数  │ 存储配额│ 消息速率│ AI额度│ 操作        │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ 免费组   │  1,234  │  文本   │ 10/分钟 │ 10/天 │ [编辑]      │  │
│  │ 普通组   │    432  │  100MB  │ 30/分钟 │ 50/天 │ [编辑]      │  │
│  │ 高级组   │    186  │  1GB    │100/分钟 │200/天 │ [编辑]      │  │
│  │ 企业组   │     38  │  10GB   │ 无限制  │ 无限  │ [编辑]      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  点击 [编辑] 进入详细配置:                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 编辑用户组: 普通组                                            │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │                                                                 │  │
│  │  基本信息:                                                      │  │
│  │  组名: [普通组________]                                        │  │
│  │  显示名称 (多语言):                                            │  │
│  │    简体中文: [普通用户___]                                     │  │
│  │    English:  [Normal User___]                                 │  │
│  │                                                                 │  │
│  │  存储配额:                                                      │  │
│  │  ☑ 文本存储 (必选)                                             │  │
│  │  ☑ 非文本存储                                                  │  │
│  │    最大空间: [100] MB                                          │  │
│  │    文件冷却期: [30] 天                                         │  │
│  │                                                                 │  │
│  │  功能限制:                                                      │  │
│  │  消息速率: [30] 条/分钟                                        │  │
│  │  房间人数上限: [100] 人                                        │  │
│  │  可创建房间数: [50] 个                                         │  │
│  │  ☐ 允许创建高级加密房间                                        │  │
│  │                                                                 │  │
│  │  AI 服务配额:                                                   │  │
│  │  OCR 识别: [50] 次/天                                          │  │
│  │  PDF 转 MD: [50] 次/天                                         │  │
│  │  ☐ 图像生成 (未启用)                                           │  │
│  │  ☐ 语音识别 (未启用)                                           │  │
│  │                                                                 │  │
│  │  增值权限:                                                      │  │
│  │  ☐ 自定义表情包                                                │  │
│  │  ☐ 创建 Bot (功能未实现，灰色)                                 │  │
│  │  ☐ 高级搜索                                                    │  │
│  │                                                                 │  │
│  │  [保存] [取消]                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

Tab 3: 严重度配置

┌─────────────────────────────────────────────────────────────────────┐
│  [基础配置] [用户组配置] [严重度配置] [帮助文本管理]               │
│                           ━━━━━━━━━━━                                │
│                                                                       │
│  严重度评分配置:                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 操作类型│ 时长范围      │ 基础分│ 时长乘数│ 计算公式        │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ 禁言    │ 1小时 - 7天   │  10   │  0.1    │ 10 + (小时×0.1) │  │
│  │ 软封禁  │ 1天 - 1年     │  30   │  0.05   │ 30 + (小时×0.05)│  │
│  │ 硬封禁  │ 7天 - 2年     │  60   │  0.03   │ 60 + (小时×0.03)│  │
│  │ 软删除  │ 60天起        │ 100   │  0      │ 100 (固定)      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  差异判定阈值:                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 评分差异超过 [10] 分视为"差异过大"，需要仲裁              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  准确率计算公式:                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ accuracy_rate = MAX(0, 100 - (avg_diff / max_score × 100))    │  │
│  │                                                                 │  │
│  │ 其中:                                                           │  │
│  │  - avg_diff = total_score_diff / total_actions                │  │
│  │  - max_score = 当前配置的最大严重度评分                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  加权计算公式 (仲裁情况):                                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 当多个管理员处理同一申诉时:                                    │  │
│  │                                                                 │  │
│  │ final_score = Σ(score[i] × weight[i])                         │  │
│  │                                                                 │  │
│  │ 其中 weight[i] = accuracy_rate[i] / Σ(accuracy_rate)          │  │
│  │                                                                 │  │
│  │ 示例:                                                           │  │
│  │  管理员A: score=30, accuracy=90% → weight=0.45                │  │
│  │  管理员B: score=40, accuracy=85% → weight=0.425               │  │
│  │  管理员C: score=35, accuracy=75% → weight=0.375               │  │
│  │  final_score = 30×0.45 + 40×0.425 + 35×0.375 ≈ 34.625        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  [保存配置] [恢复默认值]                                            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

Tab 4: 帮助文本管理

┌─────────────────────────────────────────────────────────────────────┐
│  [基础配置] [用户组配置] [严重度配置] [帮助文本管理]               │
│                                           ━━━━━━━━━━━━              │
│                                                                       │
│  帮助文本管理:                                     [+ 添加新文本]    │
│                                                                       │
│  搜索: [_______________________] [搜索]                              │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Key                         │ 简体中文     │ English │ 操作   │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ permission.ban_user.tooltip │ 封禁用户     │ Ban User│ [编辑] │  │
│  │ permission.approve_reg...   │ 审核注册     │ Approve │ [编辑] │  │
│  │ user_group.storage_limit... │ 存储配额限制 │ Storage │ [编辑] │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  点击 [编辑] 进入编辑界面:                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 编辑帮助文本: permission.ban_user.tooltip                      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │                                                                 │  │
│  │  Key: permission.ban_user.tooltip                              │  │
│  │                                                                 │  │
│  │  简短文本 (按钮/标签显示):                                     │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ 简体中文: [封禁用户_______________________]             │  │  │
│  │  │ English:  [Ban User_______________________]             │  │  │
│  │  │ 繁體中文: [封禁使用者_____________________]             │  │  │
│  │  │ 日本語:   [ユーザーをBANする_______________]            │  │  │
│  │  │ 한국어:   [사용자 차단_____________________]            │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                                 │  │
│  │  悬停提示文本 (详细说明，最多2行):                             │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ 简体中文:                                               │  │  │
│  │  │ [对违规用户执行封禁操作,包括禁言(限制发言)、软封禁     │  │  │
│  │  │  (限制大部分功能)和硬封禁(强制断开连接)_______________] │  │  │
│  │  │                                                           │  │  │
│  │  │ English:                                                 │  │  │
│  │  │ [Ban violating users, including silence (restrict      │  │  │
│  │  │  messaging), soft ban (restrict most features), and     │  │  │
│  │  │  hard ban (force disconnect)__________________________] │  │  │
│  │  │                                                           │  │  │
│  │  │ ... (其他语言)                                           │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                                 │  │
│  │  文档链接 (可选):                                               │  │
│  │  [/docs/moderation#banning-users]                              │  │
│  │                                                                 │  │
│  │  [保存] [取消]                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 5. 权限与评分系统

### 5.1 严重度评分系统（伪代码）

```typescript
// 严重度评分计算
interface SeverityConfig {
  actionType: 'silence' | 'soft_ban' | 'hard_ban' | 'soft_delete';
  baseScore: number;
  durationMultiplier: number;
}

function calculateSeverityScore(
  actionType: string,
  durationHours: number,
  config: SeverityConfig[]
): number {
  const cfg = config.find(c => c.actionType === actionType);
  if (!cfg) throw new Error('Unknown action type');
  
  return cfg.baseScore + (durationHours * cfg.durationMultiplier);
}

// 示例:
// 禁言24小时 = 10 + (24 × 0.1) = 12.4分
// 软封禁72小时 = 30 + (72 × 0.05) = 33.6分
// 硬封禁720小时(30天) = 60 + (720 × 0.03) = 81.6分
```

### 5.2 准确率计算系统（伪代码）

```typescript
// 管理员准确率计算
interface ActionReview {
  adminId: number;
  originalScore: number;
  finalScore: number; // 最终生效的评分
}

async function updateAdminAccuracy(adminId: number, review: ActionReview) {
  // 获取管理员当前统计
  const stats = await db.query(
    'SELECT total_actions, total_score_diff FROM admin_accuracy WHERE admin_id = $1',
    [adminId]
  );
  
  // 计算差异
  const diff = Math.abs(review.originalScore - review.finalScore);
  
  // 更新统计
  const newTotalActions = stats.total_actions + 1;
  const newTotalDiff = stats.total_score_diff + diff;
  const avgDiff = newTotalDiff / newTotalActions;
  
  // 计算准确率 (假设最大评分为100)
  const MAX_SCORE = 100;
  const accuracyRate = Math.max(0, 100 - (avgDiff / MAX_SCORE * 100));
  
  await db.query(
    `UPDATE admin_accuracy 
     SET total_actions = $1, total_score_diff = $2, accuracy_rate = $3
     WHERE admin_id = $4`,
    [newTotalActions, newTotalDiff, accuracyRate, adminId]
  );
}
```

### 5.3 多级审核加权计算（伪代码）

```typescript
// 当多个管理员处理同一申诉时的加权计算
interface Review {
  adminId: number;
  score: number;
  accuracyRate: number;
}

function calculateWeightedScore(reviews: Review[]): number {
  // 计算总准确率
  const totalAccuracy = reviews.reduce((sum, r) => sum + r.accuracyRate, 0);
  
  // 计算每个管理员的权重
  const weights = reviews.map(r => r.accuracyRate / totalAccuracy);
  
  // 计算加权评分
  const weightedScore = reviews.reduce((sum, r, i) => {
    return sum + (r.score * weights[i]);
  }, 0);
  
  return weightedScore;
}

// 示例:
// 管理员A: score=30, accuracy=90% → weight=0.45
// 管理员B: score=40, accuracy=85% → weight=0.425
// 管理员C: score=35, accuracy=75% → weight=0.125
// final = 30×0.45 + 40×0.425 + 35×0.125 ≈ 34.875
```

### 5.4 冷却期和自动生效系统（伪代码）

```typescript
// 定时任务：检查冷却期结束的操作
async function checkCooldownExpired() {
  // 查询冷却期已结束但还未生效的操作
  const expiredActions = await db.query(
    `SELECT * FROM user_actions 
     WHERE status = 'cooldown' 
       AND cooldown_end_at <= now()`
  );
  
  for (const action of expiredActions) {
    // 检查是否有冲突的审核
    const reviews = await db.query(
      `SELECT * FROM action_reviews 
       WHERE original_action_id = $1`,
      [action.id]
    );
    
    if (reviews.length === 0) {
      // 没有其他审核，直接生效
      await applyAction(action);
    } else {
      // 有多个审核，计算最终结果
      const finalScore = calculateFinalScore(action, reviews);
      await applyWeightedAction(action, finalScore);
    }
    
    // 更新所有参与审核的管理员的准确率
    for (const review of reviews) {
      await updateAdminAccuracy(review.reviewer_admin_id, {
        adminId: review.reviewer_admin_id,
        originalScore: review.severity_score,
        finalScore: finalScore
      });
    }
  }
}

// 每小时执行一次
setInterval(checkCooldownExpired, 3600 * 1000);
```

---

## 6. UI/UX 设计规范

### 6.1 组件库选择

推荐使用 **shadcn/ui** + **Tailwind CSS**：
- **shadcn/ui**: 提供高质量的 React 组件
- **Tailwind CSS**: 实用优先的 CSS 框架
- **Recharts**: 数据可视化
- **Lucide React**: 图标库

### 6.2 Cloudflare 风格参考要素

#### 卡片设计
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-base);
}

.card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}
```

#### 按钮设计
```css
.btn-primary {
  background: var(--color-primary);
  color: white;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: all var(--transition-fast);
  border: none;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-danger {
  background: var(--color-danger);
  /* ... 类似样式 */
}
```

#### 输入框设计
```css
.input {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  color: var(--color-text-primary);
  transition: all var(--transition-fast);
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
```

#### 表格设计
```css
.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.table thead {
  background: var(--color-surface-hover);
}

.table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

.table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.table tbody tr:hover {
  background: var(--color-surface-hover);
}
```

### 6.3 辅助提示设计（悬停问号）

```typescript
// HelpTooltip 组件
import { HelpCircle } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';

interface HelpTooltipProps {
  textKey: string; // 如 'permission.ban_user.tooltip'
  docLink?: string;
}

function HelpTooltip({ textKey, docLink }: HelpTooltipProps) {
  const text = getLocalizedText(textKey, currentLanguage);
  
  return (
    <Tooltip>
      <TooltipTrigger>
        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-300 cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <p>{text.tooltip}</p>
        {docLink && (
          <a href={docLink} className="text-primary text-sm mt-2 inline-block">
            了解更多 →
          </a>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// 使用示例
<div className="flex items-center gap-2">
  <label>封禁用户</label>
  <HelpTooltip 
    textKey="permission.ban_user.tooltip"
    docLink="/docs/moderation#banning-users"
  />
</div>
```

### 6.4 状态指示器设计

```tsx
// StatusBadge 组件
function StatusBadge({ status }: { status: string }) {
  const styles = {
    active: 'bg-green-500/10 text-green-500 border-green-500/20',
    pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    banned: 'bg-red-500/10 text-red-500 border-red-500/20',
    cooldown: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  };
  
  return (
    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  );
}
```

### 6.5 响应式设计

```css
/* 移动端适配 */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    position: fixed;
    z-index: 1000;
  }
  
  .sidebar.open {
    transform: translateX(0);
  }
  
  .dashboard-content {
    padding: 16px;
  }
  
  .card {
    padding: 16px;
  }
}
```

---

## 7. 交互流程设计

### 7.1 注册审核流程

```
用户提交注册
  ↓
CF Turnstile 验证
  ↓
Dashboard 风控检查 (IP/设备/邮箱)
  ├─ 黑名单 → 拒绝
  ├─ 高风险 → 进入人工审核队列
  └─ 通过 → 继续
  ↓
检查注册模式
  ├─ 自动注册 → 发送验证码 → 验证 → 创建账户
  └─ 人工审核 → 进入待审核列表
  ↓
管理员审核 (如果需要)
  ├─ 批准 → 创建账户 → (可选)发送邮件
  └─ 拒绝 → 加入黑名单 → 不通知用户
```

### 7.2 封禁申诉流程

```
用户通过 Bot 提交申诉
  ↓
申诉进入待处理队列
  ↓
管理员A处理 (设置新处罚)
  ↓
进入3天冷却期
  ↓
(可选) 管理员B修改
  ├─ 差异不大 → 重置冷却期
  └─ 差异过大 → 需要仲裁
  ↓
(可选) 管理员C仲裁
  ↓
冷却期结束
  ↓
系统自动计算加权结果
  ↓
应用最终处罚
  ↓
更新所有参与管理员的准确率
  ↓
Bot 通知用户结果
```

### 7.3 举报处理流程

```
管理员A举报管理员B
  ↓
举报立即提交给超级管理员
  ↓
超级管理员查看举报
  ↓
审查相关操作记录和证据
  ↓
做出决定
  ├─ 驳回举报
  ├─ 警告管理员B
  ├─ 暂停部分权限
  └─ 移除管理员B
  ↓
记录到举报历史
  ↓
(可选) 通知举报人和被举报人
```

---

## 8. 多语言与帮助系统

### 8.1 语言文件结构

```
dashboard/frontend/src/locales/
├── zh-CN.json           # 简体中文
├── en.json              # English
├── zh-TW.json           # 繁體中文
├── ja.json              # 日本語
├── ko.json              # 한국어
├── eo.json              # Esperanto
└── index.ts             # 语言加载器
```

### 8.2 语言文件示例

```json
// zh-CN.json
{
  "common": {
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "edit": "编辑",
    "search": "搜索"
  },
  "sidebar": {
    "overview": "概览",
    "users": "成员管理",
    "appeals": "申诉处理",
    "admins": "管理员分组",
    "settings": "系统配置"
  },
  "permissions": {
    "ban_user": {
      "label": "封禁用户",
      "tooltip": "对违规用户执行封禁操作，包括禁言、软封禁和硬封禁"
    },
    "approve_registration": {
      "label": "审核注册",
      "tooltip": "审核用户注册申请，批准或拒绝新用户加入"
    }
  }
}
```

### 8.3 内部文档系统

创建一个简单的 Markdown 文档系统：

```
dashboard/docs/
├── zh-CN/
│   ├── getting-started.md
│   ├── user-management.md
│   ├── moderation.md
│   └── admin-roles.md
├── en/
│   ├── getting-started.md
│   ├── user-management.md
│   ├── moderation.md
│   └── admin-roles.md
└── index.json  # 文档索引
```

文档路由：`/docs/:lang/:page`

示例：`/docs/zh-CN/user-management#banning-users`

---

## 9. 部署建议

### 9.1 开发环境启动顺序

```bash
# 1. 启动数据库和缓存
docker-compose up -d postgres redis minio

# 2. 运行数据库迁移
cd dashboard/backend
npm run db:migrate

# 3. 启动后端 API
npm run dev  # 端口 3000

# 4. 启动后端监控页面
cd ../backend-monitor
npm run dev  # 端口 3001

# 5. 启动前端
cd ../frontend
npm run dev  # 端口 5173 (Vite 默认)
```

### 9.2 生产环境部署

```bash
# 使用 Nginx 反向代理

# /etc/nginx/sites-available/dashboard
upstream dashboard_backend {
    server 127.0.0.1:3000;
}

upstream dashboard_monitor {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name dashboard.internal.example.com;

    # 前端静态文件
    location / {
        root /var/www/dashboard/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://dashboard_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 监控页面
    location /monitor {
        proxy_pass http://dashboard_monitor;
    }
}
```

### 9.3 安全加固

```bash
# 限制内网访问
# /etc/nginx/conf.d/internal-only.conf

geo $internal_network {
    default 0;
    192.168.0.0/16 1;
    10.0.0.0/8 1;
}

server {
    # ...
    
    if ($internal_network = 0) {
        return 403;
    }
}
```

---

## 10. 总结

### 10.1 核心特性清单

- ✅ 三层管理员权限系统（超管/管理员/小管，可扩展）
- ✅ 精细化权限控制（每个操作单独授权）
- ✅ 严重度评分系统（自动计算处罚严重程度）
- ✅ 准确率跟踪（管理员操作质量评估）
- ✅ 多级审核机制（3天冷却期+加权计算）
- ✅ 举报系统（同级互相监督）
- ✅ 黑名单管理（7天冷却期）
- ✅ 完整的申诉流程
- ✅ 后端监控页面（完全公开，实时状态）
- ✅ 多语言支持（6+种语言）
- ✅ 深色/浅色主题切换
- ✅ 自定义色调
- ✅ 内置帮助系统（悬停提示+文档链接）
- ✅ 数据可视化（折线图/饼图/条状图）

### 10.2 下一步行动

1. **立即开始**：创建数据库迁移脚本
2. **第二步**：搭建后端
API 框架
3. **第三步**：实现后端监控页面
4. **第四步**：开发前端 Dashboard 核心页面
5. **第五步**：集成 Synapse 修改
6. **第六步**：完善多语言和帮助系统

### 10.3 预估工作量

- **数据库设计**: 2-3天
- **后端 API**: 2-3周
- **后端监控页面**: 2-3天
- **前端 Dashboard**: 3-4周
- **Synapse 集成**: 1-2周
- **测试和优化**: 1-2周

**总计**: 约 8-12 周完整开发周期

---

## 附录 A: 数据库迁移脚本模板

```sql
-- migrations/001_create_dashboard_schema.sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS dashboard;

-- 创建所有表 (参考第2节)
-- ...

COMMIT;
```

## 附录 B: API 端点清单

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users/:id/ban
POST   /api/v1/users/:id/unban

GET    /api/v1/appeals
GET    /api/v1/appeals/:id
POST   /api/v1/appeals/:id/process

GET    /api/v1/admins
POST   /api/v1/admins
GET    /api/v1/admins/:id
PUT    /api/v1/admins/:id
DELETE /api/v1/admins/:id

POST   /api/v1/reports
GET    /api/v1/reports
POST   /api/v1/reports/:id/resolve

GET    /api/v1/blacklist
POST   /api/v1/blacklist
DELETE /api/v1/blacklist/:id

GET    /api/v1/stats/overview
GET    /api/v1/stats/users
GET    /api/v1/stats/storage

GET    /api/v1/system/config
PUT    /api/v1/system/config

GET    /api/v1/help-texts
PUT    /api/v1/help-texts/:key
```

---
