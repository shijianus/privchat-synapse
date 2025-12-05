.. image:: ./docs/element_logo_white_bg.svg
   :height: 60px

**Private Chat Synapse - Enhanced Matrix Homeserver with Dashboard Management**

|support| |development| |documentation| |license| |pypi| |python|

Private Chat Synapse is an enterprise-grade `Matrix <https://matrix.org>`__ homeserver
implementation with advanced user management, risk control, and administrative dashboard capabilities.
Built on the proven Synapse codebase and enhanced with comprehensive moderation tools for
private communication platforms.

**🚀 Production-Ready Core**: Matrix federation, chat, and real-time communication
**🎛️ Advanced Dashboard**: User management, risk control, and administrative operations
**🔒 Security-First**: Four-tier risk enforcement system with real-time policy application
**⚡ High Performance**: Redis caching and PostgreSQL optimization for large-scale deployments

.. contents::

🏗️ Architecture Overview
========================

Private Chat Synapse provides a comprehensive Matrix homeserver solution with integrated administrative capabilities:

**Core System Components:**

* **Synapse Homeserver**: Full Matrix protocol implementation for chat, federation, and real-time communication
* **Dashboard Integration Module**: Advanced user management and risk control system (`synapse/dashboard_integration/`)
* **Dashboard Backend API**: REST service for administrative operations (`dashboard/backend/`) - *Coming Soon*
* **Dashboard Frontend**: React-based administrative web interface - *Coming Soon*
* **PostgreSQL Database**: Dual-schema architecture (Matrix + Dashboard data)
* **Redis Caching**: Performance optimization and real-time pub/sub messaging

**System Architecture:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Matrix Clients │◄──►│  Synapse API    │◄──►│ Dashboard API   │
│  (Element, etc) │    │   (Port 8008)   │    │   (Port 3000)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Dashboard Web  │◄──►│  PostgreSQL DB  │◄──►│      Redis      │
│ (Port 3001)     │    │   (Port 5432)   │    │   (Port 6379)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Implementation Status:**

* ✅ **Core Synapse Integration**: Complete (100%) - Production ready
* ✅ **Database Schema**: Complete (100%) - User management, bans, appeals, audit logs
* ✅ **Risk Control System**: Complete (100%) - Four-tier enforcement with real-time application
* 🔄 **Dashboard Backend API**: Partial (15%) - Basic structure, needs full implementation
* ❌ **Dashboard Frontend**: Not implemented (0%) - React interface needed
* ❌ **Matrix Bot Service**: Not implemented (0%) - Appeal collection and verification
* ❌ **Production Deployment**: Missing dashboard-specific Docker setup

**Overall Project Completion**: ~40%

🛠️ Quick Start Guide
====================

**System Requirements:**

* **Python**: 3.10+ (recommended 3.12)
* **PostgreSQL**: 12+ with UTF-8 encoding
* **Redis**: 6+ (for production caching)
* **Node.js**: 18+ (for dashboard backend development)
* **Rust toolchain**: Required for Synapse components
* **Docker & Docker Compose**: For containerized deployment

**Installation Steps:**

**Step 1 – Install Dependencies**
```bash
git clone https://github.com/your-org/privchat-synapse.git
cd privchat-synapse
poetry install --with dev -E all
python build_rust.py
```

**Step 2 – Database Setup**
```bash
# Generate homeserver configuration
poetry run python -m synapse.app.homeserver \
  --server-name your-domain.com \
  --config-path homeserver.yaml \
  --generate-config

# Apply dashboard schema to PostgreSQL
export SYNAPSE_DB='postgresql://synapse:password@localhost/synapse'
psql "$SYNAPSE_DB" -f dashboard/schema/dashboard_schema.sql
```

**Step 3 – Configure Dashboard Integration**
Add to your ``homeserver.yaml``:
```yaml
dashboard:
  enabled: true
  default_cache_ttl_seconds: 300
  redis_channel_user_events:
    - "dashboard.user.invalidate"
    - "dashboard.user.force_disconnect"
```

**Step 4 – Start Synapse**
```bash
poetry run python -m synapse.app.homeserver --config-path homeserver.yaml
```

🎛️ Dashboard Features
=====================

**Four-Tier Risk Control System:**

1. **None**: Full access with no restrictions
2. **Silence**: Can login and read messages, but cannot send content
3. **Soft Ban**: Limited access with appeal capability
4. **Hard Ban**: Complete account access blocking

**Key Capabilities:**

* **Real-time Policy Enforcement**: Instant login and message control
* **User Profile Management**: Comprehensive user information and group management
* **Ban Management**: Flexible ban system with automated enforcement
* **Appeal Processing**: Structured workflow for user appeals and reviews
* **Operation Logging**: Complete audit trail for all administrative actions
* **Media Management**: SHA256 deduplication and storage policy enforcement
* **Registration Control**: Application-based user onboarding with verification
* **Caching Layer**: High-performance Redis caching with pub/sub invalidation

**Database Schema Features:**

* **user_profiles**: User information, groups, registration status, risk levels
* **user_bans**: Active and historical ban records with detailed reasons
* **user_appeals**: Appeal submissions and processing status tracking
* **appeal_messages**: Complete appeal conversation history
* **operation_logs**: Comprehensive administrator audit trail
* **media_metadata**: File deduplication and storage tracking
* **storage_policies**: Retention rules by user, room, or global scope
* **registration_applications**: Registration workflow and review system

🚀 Usage Examples
=================

**Creating and Managing User Bans:**
```sql
-- Add a user to the dashboard system
INSERT INTO dashboard.user_profiles (synapse_user_id, user_group, registration_status, risk_level)
VALUES ('@user:your-domain.com', 'general', 'active', 'low')
ON CONFLICT (synapse_user_id) DO UPDATE SET updated_at = NOW();

-- Apply a silence ban
INSERT INTO dashboard.user_bans (user_id, ban_type, reason, created_by)
SELECT id, 'silence', 'Policy violation - temporary', '@admin:your-domain.com'
FROM dashboard.user_profiles
WHERE synapse_user_id = '@user:your-domain.com';
```

**Testing Policy Enforcement:**
```bash
# Test login with dashboard enforcement
curl -XPOST http://localhost:8008/_matrix/client/r0/login \
  -H 'Content-Type: application/json' \
  -d '{"type":"m.login.password","identifier":{"type":"m.id.user","user":"test"},"password":"password"}'

# Response for banned user: {"errcode":"M_FORBIDDEN","error":"Login blocked by server policy"}
```

**Monitoring Dashboard Integration:**
Enable debug logging in ``homeserver.yaml``:
```yaml
log_config: "/path/to/log_config.yaml"

# In log config:
loggers:
  synapse.dashboard_integration:
    level: DEBUG
```

🧪 Development and Testing
===========================

**Development Setup:**
```bash
# Install development dependencies
poetry install --with dev -E all

# Run tests with different configurations
tox                              # All environments
tox -e py311                     # Specific Python version
tox -e py311-postgres           # With PostgreSQL
tox -e py311-coverage           # With coverage reporting

# Run specific test modules
poetry run python -m pytest tests/handlers/test_message.py
poetry run python -m pytest tests/rest/client/test_login.py
```

**Code Quality:**
```bash
# Linting and formatting
poetry run ruff check .
poetry run ruff format .

# Type checking
poetry run mypy synapse/
```

**Dashboard Backend Development:**
```bash
cd dashboard/backend
npm install
npm run build
npm run dev

# Test health endpoint
curl http://localhost:3000/api/v1/health
```

📖 Documentation Structure
==========================

**Project Documentation:**
* **INTRODUCTION.md**: Complete installation and setup guide
* **ADVICE.md**: Detailed implementation advice and development roadmap
* **REPORTS.md**: Current implementation status and technical assessments
* **REQUEST.md**: Full project requirements and specifications
* **CLAUDE.md**: Development guidelines and architecture overview

**Matrix Synapse Documentation:**
* `Official Synapse Documentation <https://element-hq.github.io/synapse/latest/>`_
* `Configuration Guide <https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html>`_
* `Installation Instructions <https://element-hq.github.io/synapse/latest/setup/installation.html>`_

🔧 Configuration Reference
=========================

**Dashboard Configuration (homeserver.yaml):**
```yaml
dashboard:
  enabled: true                      # Enable dashboard integration
  default_cache_ttl_seconds: 300     # Cache TTL fallback
  redis_channel_user_events:         # Redis pub/sub channels
    - "dashboard.user.invalidate"
    - "dashboard.user.force_disconnect"
```

**Database Configuration:**
```yaml
database:
  name: psycopg2
  args:
    user: synapse
    password: your_password
    database: synapse
    host: localhost
    port: 5432
    cp_min: 5
    cp_max: 10
```

**Redis Configuration (Optional):**
```yaml
redis:
  enabled: true
  host: localhost
  port: 6379
```

⚠️ Security Considerations
==========================

**Domain Security:**
For optimal security, host Synapse on a completely different domain than other web applications. Matrix serves user-supplied content in some APIs, so domain separation prevents XSS attacks from affecting other services.

**Recommended Setup:**
* **Synapse**: ``matrix.your-domain.com``
* **Element Web**: ``chat.your-domain.com``
* **Other Services**: Different domain entirely

**Network Security:**
* Use reverse proxy (nginx, Apache, Caddy) for TLS termination
* Enable rate limiting on registration endpoints
* Configure firewall rules for database access
* Use CAPTCHA for public registration

**Database Security:**
* Use strong passwords and connection encryption
* Apply the dashboard schema with appropriate permissions
* Regular backups of both Matrix and dashboard schemas
* Consider connection pooling for production deployments

🚨 Troubleshooting
==================

**Dashboard Integration Issues:**

* **"dashboard schema unavailable"**: Apply the schema with ``psql -f dashboard/schema/dashboard_schema.sql``
* **"dashboard.enabled missing"**: Add ``dashboard: enabled: true`` to homeserver.yaml
* **Cache not updating**: Check Redis connection and pub/sub channel configuration
* **Performance issues**: Monitor cache hit/miss ratios with DEBUG logging enabled

**Backend API Issues:**

* **Port conflicts**: Change PORT in ``dashboard/backend/.env``
* **Database connection errors**: Verify DB_HOST, DB_USER, DB_PASSWORD in .env
* **Build failures**: Run ``npm install`` and ``npm run build`` in backend directory
* **Authentication errors**: Check JWT_SECRET configuration

**General Synapse Issues:**

* **Startup failures**: Check log files for specific error messages
* **Database connection**: Verify PostgreSQL is running and accessible
* **Federation problems**: Check DNS SRV records and .well-known configuration

**Getting Support:**

* **Matrix Support Room**: ``#synapse:matrix.org``
* **Element Community Support**: `Admin FAQ <https://element-hq.github.io/synapse/latest/usage/administration/admin_faq.html>`_
* **GitHub Issues**: For bug reports and feature requests (not support requests)

🤝 Contributing
===============

We welcome contributions to Private Chat Synapse! The project follows the standard Synapse development workflow with additional dashboard-specific components.

**Development Areas:**

1. **Dashboard Backend API**: Complete the Node.js/TypeScript REST service
2. **Frontend Interface**: Build the React administrative dashboard
3. **Matrix Bot Service**: Implement appeal collection and verification
4. **Production Deployment**: Create Docker Compose configuration
5. **Testing**: Increase test coverage to 90%+

**Contribution Guidelines:**
* Follow `Synapse Contributing Guide <https://element-hq.github.io/synapse/latest/development/contributing_guide.html>`_
* Add tests for new dashboard functionality
* Update documentation for new features
* Ensure all dashboard code is properly gated behind configuration

**Development Community:**
* **Synapse Developers**: ``#synapse-dev:matrix.org``
* **Matrix Community**: ``#matrix:matrix.org``

📄 License
==========

This software is based on Matrix Synapse and maintains the same dual-licensing model:

**Option 1: AGPL v3**
Free to use under the terms of the GNU Affero General Public License v3.

**Option 2: Commercial License**
Paid-for Element Commercial License agreement with Element (New Vector Ltd).

Please contact `licensing@element.io <mailto:licensing@element.io>`_ for commercial licensing information.

.. |support| image:: https://img.shields.io/badge/matrix-community%20support-success
  :alt: (get community support in #synapse:matrix.org)
  :target: https://matrix.to/#/#synapse:matrix.org

.. |development| image:: https://img.shields.io/matrix/synapse-dev:matrix.org?label=development&logo=matrix
  :alt: (discuss development on #synapse-dev:matrix.org)
  :target: https://matrix.to/#/#synapse-dev:matrix.org

.. |documentation| image:: https://img.shields.io/badge/documentation-%E2%9C%93-success
  :alt: (Rendered documentation on GitHub Pages)
  :target: https://element-hq.github.io/synapse/latest/

.. |license| image:: https://img.shields.io/github/license/element-hq/synapse
  :alt: (check license in LICENSE file)
  :target: LICENSE

.. |pypi| image:: https://img.shields.io/pypi/v/matrix-synapse
  :alt: (latest version released on PyPi)
  :target: https://pypi.org/project/matrix-synapse

.. |python| image:: https://img.shields.io/pypi/pyversions/matrix-synapse
  :alt: (supported python versions)
  :target: https://pypi.org/project/matrix-synapse

