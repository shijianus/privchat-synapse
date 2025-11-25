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