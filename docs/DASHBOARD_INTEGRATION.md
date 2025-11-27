Dashboard Integration (Implemented)

- Status: implemented, feature-gated via config (`enabled: false` by default)
- Scope: enforce Dashboard policy at login and client event creation; cache user routing
  state locally with TTL and invalidate via Redis pub/sub

Overview
- Adds `dashboard` config section with `enabled` and optional params.
- Introduces `synapse.dashboard_integration` with:
  - `check_login_allowed(user_id)`
  - `check_event_allowed(user_id, event_type, content)`
  - local TTL cache for user routing state
  - Redis pub/sub listener for cache invalidation and optional forced logout
- Central hooks (DASHBOARD INTEGRATION markers):
  - Login: `synapse/rest/client/login.py` (pre-token issuance)
  - Event send: `synapse/handlers/message.py` (user-originated events)

Config
Add to your `homeserver.yaml`:

```
dashboard:
  enabled: true
  # Cache TTL in seconds for dashboard routing state
  default_cache_ttl_seconds: 300
  # Redis channels (string or list) for cache invalidation and forced logout
  redis_channel_user_events:
    - "dashboard.user.invalidate"
    - "dashboard.user.force_disconnect"
```

Behavior
- When disabled, all hooks are no-ops and core Synapse behavior is unchanged.
- When enabled:
  - Login is blocked for users with `soft_ban` or `hard_ban`. Non-active registration
    states (e.g. `pending`, `suspended`) also block login with a reason.
  - Event sending is blocked for `soft_ban` and `hard_ban`. `silence` allows only
    membership changes and redactions; other event types are rejected with 403.
  - The integration reads state from `dashboard.user_profiles` and `dashboard.user_bans`.
  - On Redis pub/sub events, caches are invalidated and optional forced logout occurs.

Notes
- Caches use a simple in-process TTL; data is lazily repopulated on access.
- Pub/sub relies on Synapse's optional Redis client (`txredisapi`); if missing,
  the integration logs a warning and gracefully continues without pub/sub.
- All code paths are guarded and safe for production when `enabled: false`.

