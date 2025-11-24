# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Private Chat Synapse** fork - a customized Matrix Synapse homeserver with integrated dashboard management capabilities. The system consists of:

1. **Core Synapse Homeserver**: Matrix protocol implementation for chat, federation, and real-time communication
2. **Dashboard Integration**: User management, risk control, and administrative features (in `synapse/dashboard_integration/`)
3. **Shared Infrastructure**: PostgreSQL database with dashboard schema extensions, Redis for caching/pub/sub

## Current Implementation Status (November 2025)

### ✅ **Completed Components**
- **Database Schema**: Full dashboard schema with user profiles, bans, appeals, operation logs, media metadata, storage policies, and registration applications
- **Core Integration Module**: Complete dashboard integration logic in `synapse/dashboard_integration/__init__.py`
- **Configuration System**: Dashboard configuration management in `synapse/config/dashboard.py`
- **Risk Control System**: Four-level enforcement (none, silence, soft_ban, hard_ban) with real-time policy enforcement
- **Caching Layer**: In-memory caching with Redis pub/sub support for cache invalidation
- **Integration Hooks**: Login and message flow enforcement in `synapse/rest/client/login.py` and `synapse/handlers/message.py`
- **Basic Test Coverage**: Essential tests for pub/sub functionality and cache management

### ❌ **Missing Critical Components**
- **Dashboard Backend API**: No Node.js/TypeScript HTTP service for administrative operations
- **Frontend Dashboard**: No React/TypeScript administrative interface
- **Matrix Bot Service**: No bot for appeal collection and friend verification
- **2FA System**: No secondary password or two-factor authentication implementation
- **Production Deployment**: Missing dashboard-specific Docker Compose setup

**Overall Completion**: ~40% - Core Synapse integration complete, dashboard services missing

## Development Commands

### Environment Setup
```bash
# Using Poetry (recommended)
poetry install
python build_rust.py

# Generate configuration
poetry run python -m synapse.app.homeserver \
  --server-name your-domain \
  --config-path homeserver.yaml \
  --generate-config

# Start development server
poetry run python -m synapse.app.homeserver --config-path homeserver.yaml

# Ubuntu Server Deployment
docker-compose -f contrib/docker/docker-compose.yml up -d
```

### Prerequisites for Ubuntu Server
- **Python**: 3.10+ (tested with 3.12)
- **PostgreSQL**: 12+ (dashboard schema requires UTF-8 encoding)
- **Redis**: 6+ (optional, for production caching)
- **Docker & Docker Compose**: For containerized deployment
- **Node.js**: 18+ (for future dashboard backend development)
- **Rust toolchain**: Required for building Synapse components

### Testing
```bash
# Run tests with tox (multiple Python versions)
tox

# Run specific environment
tox -e py311

# Run with PostgreSQL
tox -e py311-postgres

# Run tests with coverage
tox -e py311-coverage

# Run specific test modules
poetry run python -m pytest tests/handlers/test_message.py
```

### Code Quality
```bash
# Linting and formatting
poetry run ruff check .
poetry run ruff format .

# Type checking
poetry run mypy synapse
```

## Architecture Overview

### Core Components

1. **HomeServer** (`synapse/server.py`): Main orchestrator managing all components
2. **Handlers** (`synapse/handlers/`): Business logic for different functionality
   - `MessageHandler`: Real-time messaging
   - `AuthHandler`: Authentication and authorization
   - `FederationHandler`: Inter-server communication
3. **REST API** (`synapse/rest/`): HTTP endpoints for client and federation
4. **Storage** (`synapse/storage/`): PostgreSQL database layer with background updates

### Dashboard Integration System

The custom dashboard system (`synapse/dashboard_integration/`) provides:

- **User Risk Control**: Four enforcement levels (none, silence, soft_ban, hard_ban)
- **Real-time Policy Enforcement**: Integrated into login and message flows
- **Caching Layer**: In-memory cache with future Redis/pub/sub support
- **Administrative Control**: External dashboard manages user states via shared database

Key integration points:
- `synapse/rest/client/login.py`: Login flow checks dashboard policies
- `synapse/handlers/message.py`: Message handling with control checks
- `synapse/config/dashboard.py`: Configuration for dashboard integration

### Database Architecture

- **Public Schema**: Core Synapse data (rooms, events, users)
- **Dashboard Schema**: Administrative data (user policies, audit logs, appeals)
- **Shared Access**: Both systems access same PostgreSQL instance with logical separation

## Configuration

### Main Configuration
- **`homeserver.yaml`**: Primary server configuration
- **`log.config`**: Logging configuration

### Dashboard Configuration
```yaml
dashboard:
  enabled: false  # Enable dashboard integration
  redis_channel_user_events: ["user_events"]  # Redis pub/sub channel list
  default_cache_ttl_seconds: 300  # Cache TTL fallback

# Dashboard schema database (same PostgreSQL instance)
# Tables created in dashboard schema, separate from synapse public schema
```

## Development Guidelines

### Code Organization
- **Dashboard Integration**: All custom code in `synapse/dashboard_integration/`
- **Configuration**: Dashboard config in `synapse/config/dashboard.py`
- **Integration Points**: Minimize changes to core Synapse files
- **Safety**: All dashboard features are gated behind `dashboard.enabled` config

### Testing Strategy
- **Unit Tests**: Test dashboard integration logic in isolation
- **Integration Tests**: Test policy enforcement in login and message flows
- **Mocking**: Mock database/Redis for unit tests
- **Test Database**: Use separate PostgreSQL instance for integration tests

### Performance Considerations
- **Caching**: User policy states cached to reduce database load
- **Batch Queries**: Avoid N+1 queries when checking room member policies
- **Pub/Sub**: Use Redis pub/sub for cache invalidation in production

## Custom Features

### User Risk Control Levels ✅ IMPLEMENTED
1. **None**: No restrictions
2. **Silence**: Can login and read, but cannot send messages
3. **Soft Ban**: Can login but limited functionality, can appeal
4. **Hard Ban**: Login blocked, appears as "account does not exist"

### Database Schema Tables ✅ IMPLEMENTED
- **user_profiles**: User information, groups, registration status
- **user_bans**: Active and historical ban records with reasons
- **user_appeals**: Appeal submissions and processing status
- **appeal_messages**: Appeal conversation history
- **operation_logs**: Administrator audit trail
- **media_metadata**: File deduplication and storage tracking
- **storage_policies**: Retention rules by user/room/global scope
- **media_sync_tasks**: Background cleanup operations
- **registration_applications**: Registration review workflow

### Dashboard Hooks ✅ IMPLEMENTED
```python
# Check if user can login (synapse/rest/client/login.py)
integration = self.hs.get_dashboard_integration()
allowed, reason = await integration.check_login_allowed(user_id)
if not allowed:
    raise LoginError(403, reason or "Login blocked by server policy")

# Check if user can send event (synapse/handlers/message.py)
allowed, reason = await integration.check_event_allowed(
    requester.user.to_string(), event_type, event_content
)
if not allowed:
    raise SynapseError(403, reason or "Event blocked by server policy")
```

## File Structure Highlights

```
synapse/
├── dashboard_integration/     # ✅ Custom dashboard system
│   ├── __init__.py           # ✅ Main integration logic (283 lines)
│   ├── cache.py              # ✅ Caching implementation (50 lines)
│   ├── db_queries.py         # ✅ Database queries (133 lines)
│   └── pubsub.py             # ✅ Redis pub/sub system (246 lines)
├── config/
│   └── dashboard.py          # ✅ Dashboard configuration (44 lines)
├── handlers/
│   ├── message.py            # ✅ Enhanced with dashboard checks
│   └── ...                   # Other core handlers
├── rest/
│   └── client/
│       └── login.py          # ✅ Enhanced with dashboard checks
├── server.py                 # ✅ Core homeserver orchestrator
└── tests/
    └── test_dashboard_integration.py  # ✅ Basic tests (112 lines)

dashboard/                     # ❌ NOT IMPLEMENTED
├── schema/
│   └── dashboard_schema.sql  # ✅ Complete database schema (129 lines)
├── backend/                   # Missing Node.js/TypeScript API
├── frontend/                  # Missing React dashboard
└── bot/                       # Missing Matrix bot service
```

## Important Notes

- **Backward Compatibility**: Dashboard integration is disabled by default
- **Minimal Core Changes**: Customizations are isolated to prevent upgrade conflicts
- **Safety First**: All dashboard code paths degrade safely when disabled
- **Performance**: Caching layer prevents database bottlenecks
- **Federation**: Core Matrix federation remains unmodified
- **Production Ready**: Synapse core integration complete, dashboard services needed

## Development Workflow

1. **Feature Development**: Implement in `synapse/dashboard_integration/`
2. **Integration**: Add hooks to core Synapse files only when necessary
3. **Testing**: Write unit tests for new dashboard functionality
4. **Configuration**: Add new config options to `synapse/config/dashboard.py`
5. **Documentation**: Update this file with new integration points

## Next Development Priorities

### Critical Missing Components
1. **Dashboard Backend API** (Node.js/TypeScript)
   - REST endpoints for user management, bans, appeals
   - JWT authentication and RBAC
   - Integration with PostgreSQL dashboard schema

2. **Frontend Administrative Interface** (React/TypeScript)
   - User management dashboard
   - Ban control and appeal processing
   - Media management and policy configuration

3. **Matrix Bot Service**
   - Appeal collection and processing
   - Friend verification for 2FA
   - Administrative notifications

4. **Production Deployment Infrastructure**
   - Dashboard-specific Docker Compose setup
   - Multi-service orchestration
   - Monitoring and health checks

This architecture enables sophisticated user management and content moderation while preserving Matrix's core functionality and federation capabilities.