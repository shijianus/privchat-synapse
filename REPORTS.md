• Admin Auth

  - Added the dashboard.admin_users table plus indexes and a bootstrap super-admin seed so the database now persists
    dashboard operators; wired the new JWT refresh/config knobs into the runtime config and env sample so deployments
    can set distinct secrets and TTLs (dashboard/schema/dashboard_schema.sql:129, dashboard/backend/src/config/env.ts:8,
    dashboard/backend/.env.example:1).
  - Introduced a formal admin/RBAC model and exposed it everywhere tokens are parsed: reusable role/permission types,
    a role→permission map, richer Redis helpers for token/lock storage, and optional JWT parsing for bootstrap flows
    (dashboard/backend/src/types/admin.ts:1, dashboard/backend/src/types/auth.ts:1, dashboard/backend/src/config/
    rbac.ts:1, dashboard/backend/src/redis/redis-service.ts:6, dashboard/backend/src/middleware/auth-middleware.ts:1).
  - Implemented the complete auth stack—service logic with password policy, login throttling, refresh/logout, controller
    + validators, Express routes, and server wiring—so /api/v1/auth/register-admin|login|refresh|logout now behave per
    REQUEST/REPORT expectations (dashboard/backend/src/services/auth-service.ts:64, dashboard/backend/src/controllers/
    auth-controller.ts:12, dashboard/backend/src/routes/auth-routes.ts:1, dashboard/backend/src/validators/auth-
    validators.ts:1, dashboard/backend/src/index.ts:8).
  - Added Jest coverage for the critical flows and brought in @types/jest so TypeScript understands the test globals;
    the suite exercises registration, duplicate/permission failures, login, and refresh token handling (dashboard/
    backend/tests/unit/auth-service.test.ts:1, dashboard/backend/package.json:39).

  Tests:

  - npm test

  Next steps: 1) hook RBAC checks into existing user/ban controllers to enforce the new permission map, 2) extend the
  same pattern to the upcoming appeals/media systems so the dashboard reaches parity with the rest of REQUEST.md.

�?

  - Built the end-to-end appeals workflow so administrators and the Matrix bot share a consistent source of truth:
    schema-backed TypeScript models, the AppealService with transactional submit/list/decision helpers, and new
    controllers/middleware/routes for both /api/v1/appeals and /api/v1/bot/appeals (dashboard/backend/src/types/
    appeal.ts:1, dashboard/backend/src/services/appeal-service.ts:1, dashboard/backend/src/controllers/appeal-
    controller.ts:1, dashboard/backend/src/routes/{appeal-routes,bot-routes}.ts:1, dashboard/backend/src/index.ts:1).
  - Added a dedicated bot JWT middleware plus configuration so services authenticate with BOT_API_SECRET and logged it
    within the env loader/sample; this isolates bot flows from administrator auth (dashboard/backend/src/middleware/
    bot-auth-middleware.ts:1, dashboard/backend/src/config/env.ts:8, dashboard/backend/.env.example:1).
  - Documented the newly exposed knobs in REPORTS.md and ensured the API wiring is captured for future dashboard steps.

  Tests:

  - npm run test -- tests/unit/appeal-service.test.ts

  Next steps: integrate appeal decisions with downstream ban/unban automation (pub/sub) and surface the new endpoints
  inside the forthcoming dashboard frontend plus Matrix bot flows.

Advice Alignment

  - Expanded `ADVICE.md` with a `REQUEST.md` alignment checklist so every functional bucket (user lifecycle, risk
    control, appeals, media, 2FA, audit, client customization, frontend, NFRs, Docker, and acceptance tests) now has an
    explicit pointer to the matching roadmap phase, keeping the documentation synchronized with `REQUEST.md` expectations
    (ADVICE.md:74).
  - Added a Synapse compatibility and Ubuntu Server bridge checklist—including Redis contract notes, deployment guards,
    and smoke-test commands—so future engineers can validate that dashboard actions continue to drive Synapse behavior
    without breaking existing code paths (ADVICE.md:756).

  Tests:

  - not run (documentation-only change)

  Next steps: keep the checklist updated whenever REQUEST.md evolves and link concrete feature tickets to the acceptance
  bullets so we always have evidence for each release.

�?RBAC Enforcement

  - Introduced a `requirePermissions` middleware so every API call now enforces the Dashboard RBAC matrix instead of
    trusting controllers to check manually, guaranteeing consistent 403 responses when scopes are missing (dashboard/
    backend/src/middleware/permission-middleware.ts:1).
  - Applied the new middleware to user, ban, and appeal routes so read/write, ban management, and appeal processing
    endpoints each demand the matching permissions from REQUEST.md §III-V, aligning runtime behavior with the documented
    5-tier RBAC hierarchy (dashboard/backend/src/routes/{user-routes,ban-routes,appeal-routes}.ts:1).

  Tests:

  - not run (per user request)

  Next steps: extend the same pattern to upcoming media, registration, and audit routes once those controllers land so
  that the permission matrix remains comprehensive.
