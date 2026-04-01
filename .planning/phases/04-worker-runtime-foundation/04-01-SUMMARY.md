---
phase: 04-worker-runtime-foundation
plan: 01
subsystem: api
tags: [typescript, interfaces, zod, worker-runtime, harness-adapter]

# Dependency graph
requires: []
provides:
  - "@hive/worker workspace package with type contracts"
  - "HarnessAdapter, HarnessCapabilities, StructuredResult, ToolDefinition interfaces"
  - "AgentCard extended with optional harness fields"
  - "Zod schemas for structured result validation"
affects: [04-02, 04-03, 04-04]

# Tech tracking
tech-stack:
  added: ["@hive/worker workspace package"]
  patterns: ["Inline types in shared to avoid circular workspace deps", "Optional fields for backward-compatible extension"]

key-files:
  created:
    - packages/hive-worker/package.json
    - packages/hive-worker/tsconfig.json
    - packages/hive-worker/src/index.ts
    - packages/hive-worker/src/types.ts
  modified:
    - packages/shared/src/types.ts
    - packages/shared/src/schemas.ts

key-decisions:
  - "Used '*' instead of 'workspace:*' for dependency — npm doesn't support workspace: protocol"
  - "Inline types in @hive/shared for AgentCard harness fields to avoid circular dependency (worker depends on shared, not reverse)"

patterns-established:
  - "Medium-thickness adapter: HarnessAdapter has execute/cancel but no session lifecycle (deferred to Phase 6)"
  - "Two-layer tool categories: 'hive' vs 'harness' for tool registry"

requirements-completed: [WKRT-01, WKRT-02, WKRT-03, WKRT-04]

# Metrics
duration: 2min
completed: 2026-04-01
---

# Phase 04 Plan 01: Worker Runtime Type Contracts Summary

**HarnessAdapter interface, 6 type contracts in @hive/worker, AgentCard harness extensions, and Zod validation schemas for structured results**

## Performance

- **Duration:** 2 min 37 sec
- **Started:** 2026-04-01T03:30:08Z
- **Completed:** 2026-04-01T03:32:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Created `@hive/worker` workspace package with full scaffold (package.json, tsconfig, barrel export)
- Defined all 6 type contracts: HarnessAdapter, HarnessCapabilities, StructuredResult, ToolDefinition, RegisteredTool, TaskPayload
- Extended AgentCard in @hive/shared with optional harnessCapabilities and harnessTools fields
- Added Zod schemas: HarnessCapabilitiesSchema, HarnessToolSchema, StructuredResultSchema
- Updated AgentRegistrationSchema to accept optional harness fields
- 318 backend tests passing, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create packages/hive-worker/ package scaffold** - `b4a20b1` (feat)
2. **Task 2: Define all worker runtime type contracts** - `1093bce` (feat)
3. **Task 3: Extend AgentCard + add StructuredResult Zod schema** - `df9c4b3` (feat)

## Files Created/Modified
- `packages/hive-worker/package.json` - @hive/worker workspace package config
- `packages/hive-worker/tsconfig.json` - TypeScript config extending base with shared reference
- `packages/hive-worker/src/index.ts` - Barrel export for all types
- `packages/hive-worker/src/types.ts` - All worker runtime type contracts (HarnessAdapter, HarnessCapabilities, StructuredResult, ToolDefinition, RegisteredTool, TaskPayload)
- `packages/shared/src/types.ts` - AgentCard extended with optional harness fields
- `packages/shared/src/schemas.ts` - Zod schemas for harness capabilities, tools, and structured results

## Decisions Made
- Used `"*"` instead of `"workspace:*"` for @hive/shared dependency — npm v10 doesn't support workspace: protocol (pnpm/yarn feature)
- Used inline types in @hive/shared for AgentCard harness fields to avoid circular workspace dependency (@hive/worker depends on @hive/shared, not reverse)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed workspace:* dependency protocol**
- **Found during:** Task 1 (package scaffold)
- **Issue:** Plan specified `"@hive/shared": "workspace:*"` but npm doesn't support workspace: protocol
- **Fix:** Changed to `"@hive/shared": "*"` matching existing packages (hive-gw, hive-memory)
- **Files modified:** packages/hive-worker/package.json
- **Verification:** `npm install` succeeded, `npm ls @hive/worker` resolves
- **Committed in:** b4a20b1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for npm compatibility. No scope creep.

## Issues Encountered
None beyond the workspace:* protocol fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All type contracts are defined and exported, ready for Plan 02 (tool registry) and Plan 03 (adapter implementations)
- AgentCard is backward-compatible — existing agents work without harness fields

---
*Phase: 04-worker-runtime-foundation*
*Completed: 2026-04-01*
