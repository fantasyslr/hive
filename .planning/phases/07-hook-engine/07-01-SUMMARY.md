---
phase: 07-hook-engine
plan: 01
subsystem: services
tags: [zod, event-bus, hooks, declarative-config]

requires:
  - phase: 04-worker-runtime
    provides: EventBus, service pattern (constructor injection, registerHooks)
provides:
  - HookEngine class with Zod config validation
  - evaluateCondition pure function (eq/neq/in/exists with dot-path resolution)
  - ActionHandler interface for extensible action types
  - HooksConfigSchema for declarative hook JSON validation
affects: [07-hook-engine plan 02, hook action handlers, hot-reload]

tech-stack:
  added: []
  patterns: [declarative-hook-config, condition-evaluator, zod-schema-validation]

key-files:
  created:
    - packages/hive-gw/src/services/hook-engine.ts
    - packages/hive-gw/src/services/hook-engine.test.ts
  modified: []

key-decisions:
  - "Zod v4 import path (zod/v4) matching existing codebase pattern"
  - "evaluateCondition as standalone exported pure function for testability"
  - "loadConfig preserves previous hooks on validation failure (safe reload)"

patterns-established:
  - "Declarative hook config: {on, if?, action} validated by Zod at load time"
  - "Condition evaluator: dot-path field resolution with operator dispatch"

requirements-completed: [HOOK-01]

duration: 2min
completed: 2026-04-01
---

# Phase 07 Plan 01: HookEngine Core Summary

**Declarative hook engine with Zod config schema, 4-operator condition evaluator, and EventBus-driven dispatch to pluggable ActionHandlers**

## Performance

- **Duration:** 109s (~2 min)
- **Started:** 2026-04-01T07:02:27Z
- **Completed:** 2026-04-01T07:04:16Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Zod schemas validate declarative hook configs ({on, if?, action}) with clear error messages on invalid input
- evaluateCondition supports eq/neq/in/exists operators with nested dot-path field resolution
- HookEngine loads config, subscribes to EventBus events, dispatches to registered ActionHandlers
- 20 unit tests covering all operators, schema validation, dispatch, condition filtering, and error resilience

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for HookEngine core** - `5b7c10b` (test)
2. **Task 1 (GREEN): Implement HookEngine core** - `22cda88` (feat)

**Plan metadata:** pending

_Note: TDD task with RED/GREEN commits_

## Files Created/Modified
- `packages/hive-gw/src/services/hook-engine.ts` - HookEngine class, Zod schemas, evaluateCondition, ActionHandler interface
- `packages/hive-gw/src/services/hook-engine.test.ts` - 20 unit tests for condition evaluation, schema validation, engine dispatch

## Decisions Made
- Used `zod/v4` import path matching existing codebase convention (routes/templates.ts, middleware/validate.ts)
- evaluateCondition exported as standalone pure function (not a class method) for easy unit testing and reuse
- loadConfig preserves previous hooks when new config fails validation — safe for hot-reload in Plan 02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HookEngine core ready for Plan 02 to build action handlers (http, feishu, chain-task) and hot-reload on top
- ActionHandler interface defined and tested — implement concrete handlers by conforming to the interface
- loadConfig safe-reload behavior already supports hot-reload use case

---
*Phase: 07-hook-engine*
*Completed: 2026-04-01*
