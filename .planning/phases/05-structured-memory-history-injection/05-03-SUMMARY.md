---
phase: 05-structured-memory-history-injection
plan: 03
subsystem: history-injection
tags: [memory, injection, dual-channel, dispatcher]
dependency_graph:
  requires: [memory-service, task-machine, dispatcher]
  provides: [history-injector, dispatcher-injection-wiring]
  affects: [task-assignment-flow]
tech_stack:
  added: []
  patterns: [dual-channel-retrieval, fire-and-forget-async, optional-dependency-injection]
key_files:
  created:
    - packages/hive-gw/src/services/history-injector.ts
    - packages/hive-gw/src/services/history-injector.test.ts
  modified:
    - packages/hive-gw/src/services/dispatcher.ts
    - packages/hive-gw/src/services/dispatcher.test.ts
    - packages/hive-gw/src/services/task-machine.ts
decisions:
  - LlmClient interface defined locally in history-injector.ts instead of importing from @hive/worker to avoid cross-package dependency
metrics:
  duration: 237
  completed: "2026-04-01T05:50:59Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 10
  tests_total_passing: 114
---

# Phase 05 Plan 03: History Injector + Dispatcher Wiring Summary

HistoryInjector with dual-channel retrieval (cosine + LLM re-ranking) wired into Dispatcher.autoAssign so agents see prior conclusions before starting work.

## What Was Done

### Task 1: HistoryInjector with dual-channel retrieval
**Commit:** 75a797a

Created `HistoryInjector` service that searches shared memory for related past conclusions and returns top-3 as `HistoryContext[]`.

- `inject(task)` builds query from title+description, searches memory with limit=10
- When all cosine scores >= 0.3: returns top-3 sorted by score (fast path)
- When any score < 0.3 and LLM available: triggers LLM re-ranking of candidates (HINJ-03, D-10)
- LLM re-ranking failure gracefully falls back to vector-only scores
- `inject()` never throws — all errors caught, returns empty array (D-11)
- 7 tests covering: scoring, re-ranking, LLM fallback, empty results, error handling, JSON parsing, vector-only mode

### Task 2: Wire HistoryInjector into Dispatcher.autoAssign
**Commit:** f97bda6

- Dispatcher constructor accepts optional `HistoryInjector` (3rd param, backward compatible)
- `autoAssign()` calls `injector.inject(task)` fire-and-forget before claim (D-08)
- `TaskMachine.updateContextRef()` added to set contextRef on tasks
- Injection failure never blocks assignment (D-11)
- 3 new tests: injection wiring, backward compat, failure resilience
- All 114 existing + new tests pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] LlmClient interface defined locally instead of importing from @hive/worker**
- **Found during:** Task 1
- **Issue:** Plan specified `import type { LlmClient } from '@hive/worker'` but @hive/worker is not a dependency of hive-gw package
- **Fix:** Defined minimal `LlmClient` interface directly in history-injector.ts (just `query(prompt: string): Promise<string>`)
- **Files modified:** packages/hive-gw/src/services/history-injector.ts
- **Commit:** 75a797a

## Known Stubs

None — all functionality is fully wired with real implementations.

## Verification

- `npx vitest run` — 114 tests pass (7 new history-injector + 3 new dispatcher)
- `npx tsc --noEmit -p packages/hive-gw/tsconfig.json` — 3 pre-existing errors (feishu-webhook, templates routes), none from this plan's changes

## Self-Check: PASSED
