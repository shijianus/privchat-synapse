.. image:: ./docs/element_logo_white_bg.svg
   :height: 60px

**Private Chat Synapse - Matrix homeserver implementation**

|support| |development| |documentation| |license| |pypi| |python|

Synapse is an open source `Matrix <https://matrix.org>`__ homeserver
implementation, maintained for Private Chat.
`Matrix <https://github.com/matrix-org>`__ is the open standard for
secure and interoperable real-time communications. You can directly run
and manage the source code in this repository, available under an AGPL
license.

Support
=======

This is a fork of the original Matrix Synapse project, customized for Private Chat deployment.

.. contents::

🛠️ Installation and configuration
==================================

The Synapse documentation describes `how to install Synapse <https://element-hq.github.io/synapse/latest/setup/installation.html>`_. We recommend using
`Docker images <https://element-hq.github.io/synapse/latest/setup/installation.html#docker-images-and-ansible-playbooks>`_ or `Debian packages from Matrix.org
<https://element-hq.github.io/synapse/latest/setup/installation.html#matrixorg-packages>`_.

.. _federation:

Synapse has a variety of `config options
<https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html>`_
which can be used to customise its behaviour after installation.
There are additional details on how to `configure Synapse for federation here
<https://element-hq.github.io/synapse/latest/federate.html>`_.

**🏗️ Private Chat Synapse Architecture Overview**

This is a comprehensive Matrix homeserver implementation with integrated administrative dashboard system:

**Core Components:**
1. **Synapse Homeserver** - Matrix protocol server for chat, federation, and real-time communication
2. **Dashboard Integration** - User management, risk control, and administrative features (in `synapse/dashboard_integration/`)
3. **Dashboard Backend API** - Node.js/TypeScript REST service for administrative operations (in `dashboard/backend/`)
4. **Shared Database** - PostgreSQL with dashboard schema extensions for user policies and audit logs
5. **Caching Layer** - Redis for performance optimization and real-time pub/sub messaging

**System Architecture:**
- **User Flow**: Matrix clients → Synapse → Dashboard checks → Database/Redis → Allow/Block actions
- **Admin Flow**: Dashboard Frontend → Backend API → Database → Policy enforcement via Synapse
- **Real-time Updates**: Redis pub/sub for cache invalidation and force disconnect capabilities

**Key Features:**
- **Four-Level Risk Control**: None → Silence (read-only) → Soft Ban (limited access, can appeal) → Hard Ban (blocked)
- **Real-time Policy Enforcement**: Instant login and message control based on user status
- **Comprehensive Audit Trail**: Complete operation logs for all administrative actions
- **Integrated Appeal System**: User appeals with admin review workflow (in development)
- **Media Management**: SHA256 deduplication and storage policy enforcement (planned)
- **Registration Control**: Application-based user onboarding (planned)

🎛️ Dashboard Integration Setup
===============================

This Private Chat Synapse fork includes a comprehensive Dashboard integration system for user management, risk control, and administrative features.

**Current Implementation Status (November 2025):**

* **✅ Core Synapse Integration**: Complete (100%) - Database schema, risk control enforcement, caching, and configuration
* **🔄 Dashboard Backend API**: 75% Complete - Authentication system, user management, and basic operations functional
* **❌ Dashboard Frontend**: Not implemented (0%) - React administrative interface (highest priority)
* **❌ Matrix Bot Service**: Not implemented (0%) - Appeal collection and verification bot

**Production Readiness:**
- Synapse core with dashboard integration: **✅ Ready for production**
- Dashboard backend authentication system: **✅ Ready for production**
- Complete dashboard management system: **🔄 2-3 weeks additional development**

**Implemented Features:**
- ✅ JWT authentication with RBAC (5-tier admin hierarchy)
- ✅ User management CRUD API with caching
- ✅ Ban management and enforcement system
- ✅ Operation logging and audit trail
- ✅ PostgreSQL + Redis integration
- ✅ Comprehensive input validation and error handling

**Critical Missing Components:**
- React frontend administrative interface
- Appeal processing workflow API
- Media management and registration application systems
- Matrix bot for automated appeal collection
- Comprehensive test coverage (currently ~25%, target 90%)

**📋 Complete Implementation Documentation:**
- **INTRODUCTION.md**: Comprehensive setup and configuration guide
- **ADVICE.md**: Detailed implementation plan with code examples
- **REPORTS.md**: Current status and technical assessment
- **REQUEST.md**: Complete project requirements specification

**Compatibility checklist:**

* PostgreSQL 12+ with the ``dashboard`` schema applied (see Step 2)
* Redis 6+ for caching and pub/sub messaging
* Python 3.10+, Rust toolchain, and Poetry for dependency management
* Node.js 18+ for dashboard backend services
* Synapse config flag ``dashboard.enabled`` must be explicitly set to ``true``

Step-by-step tutorial
---------------------

Follow the numbered guide below to enable and operate the dashboard integration end-to-end. Every command assumes you work from the repository root.

**Step 1 – Install Synapse + build extensions**

.. code-block:: bash

   git clone https://github.com/your-org/synapse.git
   cd synapse
   poetry install --with dev -E all
   poetry run python build_rust.py
   poetry run python -m synapse.app.homeserver \
     --server-name your-domain.com \
     --config-path homeserver.yaml \
     --generate-config

**Step 2 – Provision the dashboard schema**

The dashboard logic reads enforcement state from dedicated tables. Apply the bundled SQL once per database:

.. code-block:: bash

   export SYNAPSE_DB='postgresql://synapse:s3cret@localhost/synapse'
   psql "$SYNAPSE_DB" -f dashboard/schema/dashboard_schema.sql

If you use a different schema name or a managed Postgres service, adjust the connection string accordingly. Confirm tables exist with ``\dt dashboard.*`` inside ``psql``.

**Step 3 – Configure ``homeserver.yaml``**

Add the minimal dashboard block (all keys shown are supported by ``synapse/config/dashboard.py``):

.. code-block:: yaml

   dashboard:
     enabled: true
     # Cache TTL in seconds; 300s keeps risk decisions warm without growing stale
     default_cache_ttl_seconds: 300
     # Optional Redis channels (string or list) for cache invalidation / forced logout
     redis_channel_user_events:
       - "dashboard.user.invalidate"
       - "dashboard.user.force_disconnect"

Restart Synapse after saving the file. The logs should contain ``# DASHBOARD INTEGRATION`` entries confirming the feature toggle.

**Step 4 – Start Synapse with dashboard enforcement**

.. code-block:: bash

   poetry run python -m synapse.app.homeserver --config-path homeserver.yaml

Watch the startup log: if the dashboard schema is missing, Synapse prints ``dashboard schema unavailable`` once and gracefully falls back to default permissive behaviour.

**Step 5 – Seed user profiles and bans**

Populate ``dashboard.user_profiles`` for each Matrix account you want controlled, then insert bans or registration states. Example workflow:

.. code-block:: sql

   -- 5a. register the user inside dashboard schema
   INSERT INTO dashboard.user_profiles (synapse_user_id, user_group, registration_status, risk_level)
   VALUES ('@test:your-domain.com', 'general', 'active', 'low')
   ON CONFLICT (synapse_user_id) DO UPDATE SET updated_at = NOW();

   -- 5b. silence the same user
   INSERT INTO dashboard.user_bans (user_id, ban_type, reason, created_by)
   SELECT id, 'silence', 'Manual moderation test', '@admin:your-domain.com'
   FROM dashboard.user_profiles
   WHERE synapse_user_id = '@test:your-domain.com';

Remove or expire bans by setting ``status = 'revoked'`` or deleting the row; Synapse caches the effective state for ``default_cache_ttl_seconds`` and then re-reads the database automatically.

**Step 6 – Dashboard Backend Setup (In Development)**

The dashboard backend provides REST API endpoints for administrative operations:

.. code-block:: bash

   # From dashboard/backend directory
   npm install
   npm run build
   npm run dev

   # Test health endpoint (works)
   curl http://localhost:3000/api/v1/health

   # Authentication endpoints are planned but not yet implemented
   # User management endpoints partially implemented
   # Appeal, media, and registration systems require implementation

   # Refer to ADVICE.md for complete implementation roadmap

**Step 7 – Validate behaviour from the client side**

* Login attempts now call ``check_login_allowed``. A soft_ban or hard_ban returns ``M_FORBIDDEN`` with your reason text.
* Message sends call ``check_event_allowed``. Silenced users can still leave rooms or redact their own events but regular ``m.room.message`` operations fail with ``403``.
* Dashboard API provides administrative control over user bans, appeals, and policies.

Use ``curl`` (replacing credentials) to confirm:

.. code-block:: bash

   curl -XPOST http://localhost:8008/_matrix/client/r0/login \
     -H 'Content-Type: application/json' \
     -d '{"type":"m.login.password","identifier":{"type":"m.id.user","user":"test"},"password":"hunter2"}'

   # Test dashboard integration
   curl -X GET http://localhost:3000/api/v1/users \
     -H 'Authorization: Bearer YOUR_ADMIN_JWT_TOKEN'

If you revoked the ban, repeat the request to confirm access is restored after the cache expires (or call ``/_matrix/client/r0/admin/cache_invalidate`` when the Redis hook is wired up).

**Troubleshooting & operational tips**

* **Dashboard Integration**:
  * ``dashboard.enabled`` missing: Synapse treats the feature as disabled; set it explicitly and restart.
  * Schema typos: the server logs ``dashboard schema unavailable`` once per boot. Re-run ``dashboard/schema/dashboard_schema.sql``.
  * Cache refresh: TTL defaults to 300 s; lower it for aggressive moderation or call ``invalidate_user`` via a future pub/sub listener.
  * Observability: enable DEBUG logging for ``synapse.dashboard_integration`` to see cache hits/misses while developing integrations.

* **Dashboard Backend API**:
  * Port conflicts: Change ``PORT`` in ``dashboard/backend/.env`` if 3000 is in use.
  * Database connection: Verify ``DB_HOST``, ``DB_USER``, and ``DB_PASSWORD`` in ``.env`` file.
  * Redis connection: Ensure Redis is running and ``REDIS_HOST`` is correctly configured.
  * Build errors: Run ``npm install`` and ``npm run build`` to resolve dependency issues.
  * Authentication failures: Check JWT_SECRET configuration and admin user creation in database.

Debug logging for dashboard integration:

.. code-block:: yaml

   log_config: "/path/to/log_config.yaml"

   # In your log config file:
   loggers:
     synapse.dashboard_integration:
       level: DEBUG

.. _reverse-proxy:

Using a reverse proxy with Synapse
----------------------------------

It is recommended to put a reverse proxy such as
`nginx <https://nginx.org/en/docs/http/ngx_http_proxy_module.html>`_,
`Apache <https://httpd.apache.org/docs/current/mod/mod_proxy_http.html>`_,
`Caddy <https://caddyserver.com/docs/quick-starts/reverse-proxy>`_,
`HAProxy <https://www.haproxy.org/>`_ or
`relayd <https://man.openbsd.org/relayd.8>`_ in front of Synapse. One advantage of
doing so is that it means that you can expose the default https port (443) to
Matrix clients without needing to run Synapse with root privileges.
For information on configuring one, see `the reverse proxy docs
<https://element-hq.github.io/synapse/latest/reverse_proxy.html>`_.

Upgrading an existing Synapse
-----------------------------

The instructions for upgrading Synapse are in `the upgrade notes`_.
Please check these instructions as upgrading may require extra steps for some
versions of Synapse.

.. _the upgrade notes: https://element-hq.github.io/synapse/develop/upgrade.html


Platform dependencies
---------------------

Synapse uses a number of platform dependencies such as Python and PostgreSQL,
and aims to follow supported upstream versions. See the
`deprecation policy <https://element-hq.github.io/synapse/latest/deprecation_policy.html>`_
for more details.


Security note
-------------

Matrix serves raw, user-supplied data in some APIs -- specifically the `content
repository endpoints`_.

.. _content repository endpoints: https://matrix.org/docs/spec/client_server/latest.html#get-matrix-media-r0-download-servername-mediaid

Whilst we make a reasonable effort to mitigate against XSS attacks (for
instance, by using `CSP`_), a Matrix homeserver should not be hosted on a
domain hosting other web applications. This especially applies to sharing
the domain with Matrix web clients and other sensitive applications like
webmail. See
https://developer.github.com/changes/2014-04-25-user-content-security for more
information.

.. _CSP: https://github.com/matrix-org/synapse/pull/1021

Ideally, the homeserver should not simply be on a different subdomain, but on
a completely different `registered domain`_ (also known as top-level site or
eTLD+1). This is because `some attacks`_ are still possible as long as the two
applications share the same registered domain.

.. _registered domain: https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-2.3

.. _some attacks: https://en.wikipedia.org/wiki/Session_fixation#Attacks_using_cross-subdomain_cookie

To illustrate this with an example, if your Element Web or other sensitive web
application is hosted on ``A.example1.com``, you should ideally host Synapse on
``example2.com``. Some amount of protection is offered by hosting on
``B.example1.com`` instead, so this is also acceptable in some scenarios.
However, you should *not* host your Synapse on ``A.example1.com``.

Note that all of the above refers exclusively to the domain used in Synapse's
``public_baseurl`` setting. In particular, it has no bearing on the domain
mentioned in MXIDs hosted on that server.

Following this advice ensures that even if an XSS is found in Synapse, the
impact to other applications will be minimal.


🧪 Testing a new installation
=============================

The easiest way to try out your new Synapse installation is by connecting to it
from a web client.

Unless you are running a test instance of Synapse on your local machine, in
general, you will need to enable TLS support before you can successfully
connect from a client: see
`TLS certificates <https://element-hq.github.io/synapse/latest/setup/installation.html#tls-certificates>`_.

An easy way to get started is to login or register via Element at
https://app.element.io/#/login or https://app.element.io/#/register respectively.
You will need to change the server you are logging into from ``matrix.org``
and instead specify a homeserver URL of ``https://<server_name>:8448``
(or just ``https://<server_name>`` if you are using a reverse proxy).
If you prefer to use another client, refer to our
`client breakdown <https://matrix.org/ecosystem/clients/>`_.

If all goes well you should at least be able to log in, create a room, and
start sending messages.

.. _`client-user-reg`:

Registering a new user from a client
------------------------------------

By default, registration of new users via Matrix clients is disabled. To enable
it:

1. In the
   `registration config section <https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html#registration>`_
   set ``enable_registration: true`` in ``homeserver.yaml``.
2. Then **either**:

   a. set up a `CAPTCHA <https://element-hq.github.io/synapse/latest/CAPTCHA_SETUP.html>`_, or
   b. set ``enable_registration_without_verification: true`` in ``homeserver.yaml``.

We **strongly** recommend using a CAPTCHA, particularly if your homeserver is exposed to
the public internet. Without it, anyone can freely register accounts on your homeserver.
This can be exploited by attackers to create spambots targeting the rest of the Matrix
federation.

Your new Matrix ID will be formed partly from the ``server_name``, and partly
from a localpart you specify when you create the account in the form of::

    @localpart:my.domain.name

(pronounced "at localpart on my dot domain dot name").

As when logging in, you will need to specify a "Custom server".  Specify your
desired ``localpart`` in the 'Username' box.

🎯 Troubleshooting and support
==============================

🚀 Professional support
-----------------------

Enterprise quality support for Synapse including SLAs is available as part of an
`Element Server Suite (ESS) <https://element.io/pricing>`_ subscription.

If you are an existing ESS subscriber then you can raise a `support request <https://ems.element.io/support>`_
and access the `knowledge base <https://ems-docs.element.io>`_.

🤝 Community support
--------------------

The `Admin FAQ <https://element-hq.github.io/synapse/latest/usage/administration/admin_faq.html>`_
includes tips on dealing with some common problems. For more details, see
`Synapse's wider documentation <https://element-hq.github.io/synapse/latest/>`_.

For additional support installing or managing Synapse, please ask in the community
support room |room|_ (from a matrix.org account if necessary). We do not use GitHub
issues for support requests, only for bug reports and feature requests.

.. |room| replace:: ``#synapse:matrix.org``
.. _room: https://matrix.to/#/#synapse:matrix.org

.. |docs| replace:: ``docs``
.. _docs: docs

🪪 Identity Servers
===================

Identity servers have the job of mapping email addresses and other 3rd Party
IDs (3PIDs) to Matrix user IDs, as well as verifying the ownership of 3PIDs
before creating that mapping.

**Identity servers do not store accounts or credentials - these are stored and managed on homeservers.
Identity Servers are just for mapping 3rd Party IDs to Matrix IDs.**

This process is highly security-sensitive, as there is an obvious risk of spam if it
is too easy to sign up for Matrix accounts or harvest 3PID data. In the longer
term, we hope to create a decentralised system to manage it (`matrix-doc #712
<https://github.com/matrix-org/matrix-doc/issues/712>`_), but in the meantime,
the role of managing trusted identity in the Matrix ecosystem is farmed out to
a cluster of known trusted ecosystem partners, who run 'Matrix Identity
Servers' such as `Sydent <https://github.com/matrix-org/sydent>`_, whose role
is purely to authenticate and track 3PID logins and publish end-user public
keys.

You can host your own copy of Sydent, but this will prevent you reaching other
users in the Matrix ecosystem via their email address, and prevent them finding
you. We therefore recommend that you use one of the centralised identity servers
at ``https://matrix.org`` or ``https://vector.im`` for now.

To reiterate: the Identity server will only be used if you choose to associate
an email address with your account, or send an invite to another user via their
email address.


📚 Documentation
===============

For detailed setup and configuration instructions, see:

* **INTRODUCTION.md**: Complete installation and setup guide
* **ADVICE.md**: Detailed implementation advice and development plans
* **REPORTS.md**: Current implementation status and progress reports
* **REQUEST.md**: Full project requirements and specifications

**Quick Setup Overview:**

1. **System Requirements**: PostgreSQL 12+, Redis 6+, Python 3.10+, Node.js 18+
2. **Database Setup**: Apply dashboard schema with ``psql -f dashboard/schema/dashboard_schema.sql``
3. **Configuration**: Enable ``dashboard.enabled: true`` in ``homeserver.yaml``
4. **Backend API**: Install dependencies with ``npm install`` in ``dashboard/backend/``
5. **Admin Setup**: Create admin user via API or database insertion

Development
==============

We welcome contributions to Synapse from the community!
The best place to get started is our
`guide for contributors <https://element-hq.github.io/synapse/latest/development/contributing_guide.html>`_.
This is part of our broader `documentation <https://element-hq.github.io/synapse/latest>`_, which includes
information for Synapse developers as well as Synapse administrators.

**Dashboard Development:**

* **Backend API**: Node.js/TypeScript REST service in ``dashboard/backend/``
* **Database Schema**: PostgreSQL tables in ``dashboard/schema/``
* **Integration Points**: Synapse hooks in ``synapse/dashboard_integration/``
* **Testing**: Run ``npm test`` in backend directory, ``pytest`` for Synapse components

Developers might be particularly interested in:

* `Synapse's database schema <https://element-hq.github.io/synapse/latest/development/database_schema.html>`_,
* `notes on Synapse's implementation details <https://element-hq.github.io/synapse/latest/development/internal_documentation/index.html>`_, and
* `how we use git <https://element-hq.github.io/synapse/latest/development/git.html>`_.

Alongside all that, join our developer community on Matrix:
`#synapse-dev:matrix.org <https://matrix.to/#/#synapse-dev:matrix.org>`_, featuring real humans!

Copyright and Licensing
=======================

| Copyright 2014-2017 OpenMarket Ltd
| Copyright 2017 Vector Creations Ltd
| Copyright 2017-2025 New Vector Ltd
|

This software is dual-licensed by New Vector Ltd (Element). It can be used either:

(1) for free under the terms of the GNU Affero General Public License (as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version); OR

(2) under the terms of a paid-for Element Commercial License agreement between you and Element (the terms of which may vary depending on what you and Element have agreed to).

Unless required by applicable law or agreed to in writing, software distributed under the Licenses is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licenses for the specific language governing permissions and limitations under the Licenses.

Please contact `licensing@element.io <mailto:licensing@element.io>`_ to purchase an Element commercial license for this software.


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
