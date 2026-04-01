---
phase: 04-worker-runtime-foundation
plan: 03
subsystem: worker-runtime
tags: [tool-registry, hive-tools, harness-tools, agent-registry]

requires:
  - phase: 04-01
    provides: "ToolDefinition, RegisteredTool, ToolCategory types in hive-worker/types.ts; AgentCard harnessCapabilities/harnessTools fields in shared/types.ts"
provides:
  - "ToolRegistry class with 5 pre-registered Hive tools and harness tool CRUD"
  - "AgentRegistry verified to persist harnessCapabilities and harnessTools"
affects: [04-04, dispatcher, worker-runtime]

tech-stack:
  added: []
  patterns: [two-layer-tool-registry, category-filtered-queries]

key-files:
  created:
    - packages/hive-worker/src/tool-registry.ts
    - packages/hive-worker/src/tool-registry.test.ts
  modified:
    - packages/hive-worker/src/index.ts
    - packages/hive-gw/src/services/registry.test.ts

key-decisions:
  - "Hive tools are static constants, not DB-backed — sufficient for 5 built-in tools"
  - "Harness tools stored per-agent in Map, cleaned up on unregisterAgent"

patterns-established:
  - "Two-layer registry: hive (static) + harness (per-agent dynamic)"
  - "Category-filtered getAll() for tool queries"

requirements-completed: [WKRT-04]

duration: 2min
completed: 2026-04-01
---

# Phase 04 Plan 03: Tool Registry Summary

**Two-layer ToolRegistry with 5 Hive tools (memory.search/write, task.create, board.read, feishu.send) and per-agent harness tool CRUD; AgentRegistry verified to persist harness metadata**

## Performance

- **Duration:** 2 min 25 sec
- **Started:** 2026-04-01T03:34:52Z
- **Completed:** 2026-04-01T03:37:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ToolRegistry with 5 pre-registered Hive tools with correct isReadOnly/isConcurrencySafe flags
- Harness tool registration, query by agent, category filtering, and cleanup
- Verified AgentRegistry already persists harnessCapabilities and harnessTools via spread pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement ToolRegistry with Hive tools** - `a02306e` (test: RED) + `af917ec` (feat: GREEN)
2. **Task 2: Extend AgentRegistry tests for harness metadata** - `b20c6ea` (test)

## Files Created/Modified
- `packages/hive-worker/src/tool-registry.ts` - Two-layer tool registry class with 5 Hive tools
- `packages/hive-worker/src/tool-registry.test.ts` - 7 unit tests covering all registry operations
- `packages/hive-worker/src/index.ts` - Barrel export for ToolRegistry
- `packages/hive-gw/src/services/registry.test.ts` - 2 new tests for harnessCapabilities/harnessTools persistence

## Decisions Made
- Hive tools are static constants (not database-backed) — 5 tools don't need dynamic storage
- Harness tools keyed by agentId in a Map — natural cleanup on agent unregister

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ToolRegistry ready for use by worker runtime dispatcher
- AgentRegistry harness metadata ready for routing decisions
- Plan 04 can build on tool registry for dispatcher integration

---
*Phase: 04-worker-runtime-foundation*
*Completed: 2026-04-01*
