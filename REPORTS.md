# User Directory API Integration & Risk Monitoring (REQUEST.md §III · ADVICE Priority 1)

## Backend-Aligned Types & API Client
- Reconciled the frontend `UserProfile` contract with the actual `dashboard.user_profiles` schema so Synapse IDs, group tiers, registration states, and risk levels are represented exactly as the Node backend emits them (dashboard/frontend/src/types/dashboard.ts).
- Simplified `ApiService.getUsers` to speak the backend filter dialect (`userGroup`, `registrationStatus`, `riskLevel`, `keyword`) and emit plain arrays, matching the Express controller output without stubbed pagination (dashboard/frontend/src/services/api.ts).

## UsersPage Workflow & Filters
- Replaced the placeholder grid with a React Query-powered directory that hydrates directly from `/api/v1/users`, persists filters in component state, and exposes quick actions to refresh cache-invalidation events (dashboard/frontend/src/pages/UsersPage.tsx).
- Added translated selectors for the four policy-driven groups, registration decisions, and the four-level risk ladder so operators can enforce REQUEST.md’s lifecycle rules from the UI without touching the DB manually.
- Displayed live metrics for pending approvals, suspended accounts, and high-risk ratios derived per query so moderators can audit risk posture before issuing bans.

## Risk Telemetry & UX Polish
- Surfaced a per-level risk snapshot and highlighted row badges for group/status/risk combinations, mirroring the Redis-driven invalidation flows documented in ADVICE.md.
- Centralized Tailwind badge styles and date formatting helpers to keep the layout consistent with RULES.md formatting requirements.

## Testing & Validation
- `npx tsc -b` (dashboard/frontend) ✅ — strict compilation (with `verbatimModuleSyntax`, `noUnusedLocals`, etc.) now succeeds after the type-only import fixes and React Query refactor.
- `npm run build` ⚠️ — Vite’s Rollup binary (`@rollup/rollup-win32-x64-msvc`) fails to load on this Windows host (`ERR_DLOPEN_FAILED`). Reinstalling that optional dependency per the error hint should unblock a full bundle build on a clean machine.

# Dashboard Frontend Progress – Authentication & Routing

## Authentication Foundation
- Installed the missing frontend dependencies (`axios`, `zustand`, `react-router-dom`, `@tanstack/react-query`, `react-hook-form`) so the web client can finally talk to the near-complete backend described in REQUEST.md/ADVICE.md.
- Replaced the mock auth store with a persisted Zustand store that logs in through `ApiService`, writes JWT + refresh tokens to storage, hydrates users on refresh, refreshes sessions, and clears local cache on logout (dashboard/frontend/src/store/authStore.ts, src/types/auth.ts).
- Wired `LoginPage` to `react-hook-form`, added router-based redirects, and ensured validation errors are surfaced consistently (dashboard/frontend/src/pages/LoginPage.tsx).

## Routing & Layout
- Introduced React Router + React Query providers in `App.tsx` and created a `ProtectedRoute` guard so only authenticated operators can access the dashboard shell (dashboard/frontend/src/App.tsx, src/components/layout/ProtectedRoute.tsx).
- Added a reusable `DashboardLayout` with navigation tabs for the major REQUEST.md areas (Users, Bans, Appeals, Logs, Settings) plus a sign-out action that reuses the auth store (dashboard/frontend/src/components/layout/DashboardLayout.tsx).

## Feature Pages & Forms
- Broke the main view into dedicated pages (`DashboardHomePage`, `UsersPage`, `BansPage`, `AppealsPage`, `LogsPage`, `SettingsPage`) that reflect the documented workflows: each page displays the relevant KPIs, policy matrices, or placeholder data tables pulled from REQUEST.md/ADVICE.md so the frontend skeleton now mirrors the roadmap (dashboard/frontend/src/pages/*.tsx).
- Implemented the first configuration form (“Media Storage Policy”) with `react-hook-form`, covering retention periods, deduplication, and friend-verification toggles demanded by RULES.md §VI/§VIII (dashboard/frontend/src/pages/SettingsPage.tsx).

## Types & Utilities
- Added `src/types/index.ts` to re-export the auth/dashboard models so shared modules (e.g., ApiService) can import from a single entrypoint without compiler warnings.

## Testing & Follow-up
- `npx tsc --noEmit` (dashboard/frontend) ✅ — validates the new store, router, and forms compile under the existing strict TS config.
- `npm run lint` ⚠️ — ESLint 9 currently fails on this machine because the bundled Hermes parser WebAssembly module refuses to initialize (error thrown from `hermes-parser/dist/HermesParserWASM.js` before lint rules execute). No new lint violations were reported; rerun once the environment supports that parser.
- Next: hook the placeholder pages to live API data, finish appeal/bot UIs, and extend docker-compose so the frontend module can be tested alongside the completed backend services.

# Backend Compatibility Audit & Host Binding (REQUEST.md §I/§II)

## API Host Binding & Local-Network Isolation
- Added a `host` property to the dashboard API runtime configuration (default `127.0.0.1`) so deployments remain confined to the loopback interface unless explicitly overridden for Docker networking (dashboard/backend/src/config/env.ts).
- Updated the Express bootstrap to bind to that host and log the exact endpoint, satisfying REQUEST.md’s rule that all services stay on the internal network (dashboard/backend/src/index.ts).

## Cross-Platform Compatibility Script
- Hardened `test_compatibility.py` with ASCII-safe logging and robust import parsing so Windows consoles can execute the Ubuntu-readiness audit without GBK codec crashes.
- The compatibility audit now validates schema definitions, module presence, documentation, and environment-variable patterns before deploying to Ubuntu.
- Ran `python test_compatibility.py` — all 7 checks pass, and the generated recommendations cover the ADVICE.md system-testing expectations.
