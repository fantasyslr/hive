---
phase: 04-worker-runtime-foundation
plan: 04
subsystem: worker-runtime
tags: [typescript, adapter-pattern, harness, worker-bridge, structured-result]

requires:
  - phase: 04-worker-runtime-foundation/plan-01
    provides: HarnessAdapter interface and types
  - phase: 04-worker-runtime-foundation/plan-02
    provides: ClaudeAdapter, GeminiAdapter, CodexAdapter implementations
  - phase: 04-worker-runtime-foundation/plan-03
    provides: ToolRegistry and extractStructuredResult

provides:
  - Typed worker-bridge.ts using HarnessAdapter instead of bash spawn
  - Registration with harnessCapabilities and harnessTools
  - JSON-serialized StructuredResult as task output
  - HIVE_HARNESS env var for adapter selection

affects: [structured-memory, history-injection, coordinator]

tech-stack:
  added: []
  patterns: [adapter-factory-pattern, typed-task-execution]

key-files:
  created: []
  modified:
    - scripts/worker-bridge.ts
    - scripts/start-worker-profile.sh

key-decisions:
  - "Adapter factory pattern with switch on HIVE_HARNESS env var for runtime adapter selection"

patterns-established:
  - "Adapter factory: createAdapter(harness) returns HarnessAdapter by name"
  - "Task results are always JSON-serialized StructuredResult, never raw stdout"

requirements-completed: [WKRT-01, WKRT-03]

duration: 2min
completed: 2026-04-01
---

# Phase 04 Plan 04: Bridge Rewrite Summary

**Rewrote worker-bridge.ts to use typed HarnessAdapter from @hive/worker, deleted bash worker-adapter.sh, registration now sends harness metadata**

## Performance

- **Duration:** 158s (~2.5 min)
- **Started:** 2026-04-01T04:28:08Z
- **Completed:** 2026-04-01T04:30:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- worker-bridge.ts is now a typed runtime client using HarnessAdapter.execute() instead of spawning bash
- Registration sends harnessCapabilities and harnessTools to gateway for each agent
- Task results are JSON-serialized StructuredResult (not raw stdout)
- Deleted worker-adapter.sh -- one-step migration with no bash fallback (D-12)
- Worker profile scripts updated to use HIVE_HARNESS instead of HIVE_WORKER_COMMAND

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite worker-bridge.ts to use typed adapters** - `9c4eb29` (feat)
2. **Task 2: Delete worker-adapter.sh and update worker profiles** - `026ea72` (feat)

## Files Created/Modified
- `scripts/worker-bridge.ts` - Rewritten: imports from @hive/worker, adapter factory, typed execute, harness metadata in registration
- `scripts/worker-adapter.sh` - DELETED (replaced by TypeScript adapters)
- `scripts/start-worker-profile.sh` - Updated: HIVE_HARNESS replaces HIVE_WORKER_COMMAND

## Decisions Made
- Used adapter factory pattern (switch on HIVE_HARNESS) rather than dynamic import -- simpler, explicit, type-safe
- Removed local interface duplications (AgentCard, Task, BoardSnapshot) in favor of imports from @hive/shared

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test suite picks up hive-ui tests from parallel agent worktrees (.claude/worktrees/) causing false failures -- not related to this plan's changes. Core backend tests (29 files, 173 tests) all pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Worker runtime foundation is complete (all 4 plans done)
- Typed adapter pipeline is end-to-end: adapters -> bridge -> gateway
- Ready for structured memory extraction (SMEM) which consumes StructuredResult
- Ready for history injection (HINJ) which uses the memory context path already in the bridge

---
*Phase: 04-worker-runtime-foundation*
*Completed: 2026-04-01*

## Self-Check: PASSED

All files verified present, worker-adapter.sh confirmed deleted, both commit hashes found in git log.
