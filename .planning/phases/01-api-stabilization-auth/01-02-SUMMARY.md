---
phase: 01-api-stabilization-auth
plan: 02
subsystem: hive-gw
tags: [auth, middleware, bearer-token]
dependency_graph:
  requires: []
  provides: [auth-middleware, hive-users-config]
  affects: [all-api-routes]
tech_stack:
  added: []
  patterns: [express-middleware, bearer-token-auth, global-type-augmentation]
key_files:
  created:
    - packages/hive-gw/src/middleware/auth.ts
    - packages/hive-gw/src/middleware/auth.test.ts
  modified:
    - packages/hive-gw/src/config.ts
    - packages/hive-gw/src/index.ts
decisions:
  - Health endpoint exempt from auth for monitoring/load balancer compatibility
  - Dev fallback tokens are deterministic strings (hive-token-{role}) for easy local testing
  - HIVE_USERS env var overrides defaults in production
metrics:
  duration: 95s
  completed: "2026-03-30T15:02:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 01 Plan 02: Bearer Token Auth Middleware Summary

Bearer token auth with 4 fixed team users (ad_buyer/operations/creative/manager) loaded from HIVE_USERS env var with dev fallback defaults.

## What Was Done

### Task 1: Create user config and auth middleware (a6812e0)

Added `HiveUser` interface and user configuration to `config.ts`:
- 4 default users with roles matching team structure (投放, 运营, 素材, 主管)
- `HIVE_USERS` env var support for production override (JSON array)
- `tokenToUser` Map for O(1) token lookup

Created `authMiddleware` at `packages/hive-gw/src/middleware/auth.ts`:
- Validates `Authorization: Bearer <token>` header
- Returns 401 for missing, wrong scheme, or invalid tokens
- Attaches `HiveUser` to `req.user` via Express global type augmentation

5 test cases covering: no header, wrong scheme, invalid token, valid manager token, valid ad_buyer token.

### Task 2: Apply auth middleware to all routes (dc7a22b)

Modified `packages/hive-gw/src/index.ts`:
- Moved `/health` endpoint above auth middleware (unauthenticated for monitoring)
- Added `app.use(authMiddleware)` before all route registrations
- All protected routes: /agents, /tasks, /board, /events, /heartbeat, /memory, /webhooks/feishu, / (docs)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- Auth middleware tests: 5/5 passed
- Auth middleware placement: /health at line 34, authMiddleware at line 43, first route at line 46
- Pre-existing test failures (5 tests in events, review-fixes, task-fields, task-orchestration) confirmed unrelated to auth changes

## Known Stubs

None.
