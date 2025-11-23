Dashboard Integration (Initial Scaffold)

- Status: scaffolded, disabled by default
- Scope: safe hooks for login and event creation to enforce Dashboard policy

Overview
- Adds `dashboard` config section with `enabled` flag (default false).
- Introduces `synapse.dashboard_integration` module exposing a small API:
  - `check_login_allowed(user_id)`
  - `check_event_allowed(user_id, event_type, content)`
- Central hooks:
  - Login: `synapse/rest/client/login.py:_complete_login`
  - Event send: `synapse/handlers/message.py:EventCreationHandler.create_event`

Config
Add to your homeserver.yaml:

```
dashboard:
  enabled: true
  # redis_channel_user_events: "user.banned"        # reserved for future
  # default_cache_ttl_seconds: 300                   # reserved for future
```

Behavior
- When disabled, all hooks are no-ops and core Synapse behavior is unchanged.
- When enabled, login is blocked for users with `soft_ban` or `hard_ban` in
  their routing state; `silence` allows membership/redaction only.

Notes
- The initial implementation uses an in-memory cache only. Future work should
  wire Postgres queries and Redis pub/sub per project design (REQUEST/ GUIDE).
- All code paths are guarded and safe for production when `enabled: false`.

