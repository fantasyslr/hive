---
phase: "06"
plan: "03"
subsystem: coordinator-service
tags: [coordinator, decomposition, synthesis, llm, dag]
dependency_graph:
  requires: [task-machine, event-bus, dispatcher, dependency-unblocker]
  provides: [coordinator-service, synthesis-trigger]
  affects: [index.ts, dependency-unblocker]
tech_stack:
  added: []
  patterns: [fire-and-forget-async, title-to-id-resolution, llm-side-query, synthesis-aggregation]
key_files:
  created:
    - packages/hive-gw/src/services/coordinator-service.ts
    - packages/hive-gw/src/services/coordinator-service.test.ts
  modified:
    - packages/hive-gw/src/services/dependency-unblocker.ts
    - packages/hive-gw/src/services/dependency-unblocker.test.ts
    - packages/hive-gw/src/index.ts
decisions:
  - CoordinatorService uses fire-and-forget async pattern (same as VerifyLoop) for non-blocking hook execution
  - LlmClient passed as null at gateway startup — real LLM wired later via env config
  - Synthesis trigger lives in DependencyUnblocker (not a separate service) since it reacts to the same task.completed event
key_decisions:
  - "Synthesis trigger in DependencyUnblocker: co-located with dependency checking since both react to task.completed"
  - "LlmClient null at startup: same pattern as HistoryInjector — real provider wired via config"
metrics:
  duration_seconds: 239
  completed: "2026-04-01"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
requirements: [CORD-01, CORD-03]
---

# Phase 06 Plan 03: CoordinatorService + Synthesis Trigger Summary

CoordinatorService decomposes coordinate tasks into sub-task DAGs via LLM side query; DependencyUnblocker auto-creates synthesize tasks when all sub-tasks complete and transitions parent to done on synthesis completion.

## What Was Built

### Task 1: CoordinatorService (cc9f80b)
- `CoordinatorService` listens on `task.assigned` events for `taskKind === 'coordinate'`
- Calls LLM with decomposition prompt, parses JSON array of sub-tasks
- Creates sub-tasks via `TaskMachine.create()` with `parentTaskId` and `runId` linking
- Two-pass dependency resolution: first create all tasks building `titleToId` map, then resolve `dependsOn` titles to IDs
- Auto-assigns independent sub-tasks (no deps) via Dispatcher
- Transitions coordinate task to `working` after successful decomposition
- Graceful LLM failure: logs warning, task stays `claimed` for manual handling
- 6 tests covering: decomposition, dependency resolution, non-coordinate ignore, LLM failure, auto-assign, status transition

### Task 2: Synthesis Trigger + Gateway Wiring (ac427aa)
- Extended `DependencyUnblocker.onTaskCompleted()` with synthesis check
- When all siblings of a coordinate parent reach `done`, auto-creates a `synthesize` task
- Synthesize task's `contextRef` contains JSON-serialized array of sibling results (taskId, title, result, taskKind)
- When synthesize task completes, transitions parent coordinate task to `done` with synthesized result
- `CoordinatorService` instantiated in `index.ts` with `null` LlmClient and hooks registered after DependencyUnblocker
- 4 new tests: all siblings done triggers synthesis, partial does not, non-coordinate parent ignored, synthesize completion transitions parent

## Decisions Made

1. **Synthesis trigger in DependencyUnblocker**: Co-located with dependency unblocking since both react to `task.completed` — avoids duplicate event scanning.
2. **LlmClient null at startup**: Same injectable pattern as HistoryInjector. Real LLM provider configured via environment or passed at construction time.
3. **Fire-and-forget async**: CoordinatorService decomposition runs async with `.catch()` error logging — consistent with VerifyLoop pattern.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `CoordinatorService` created with `null` LlmClient in `index.ts` — coordinate tasks will log a warning and stay claimed until a real LLM provider is wired (expected to be configured in a future plan or via env).

## Verification

- All 1407 gateway tests pass (256 test files)
- `CoordinatorService` exported and wired in index.ts
- `synthesize` keyword present in dependency-unblocker.ts
- `checkSynthesisTrigger` method handles synthesis lifecycle

## Self-Check: PASSED

All files exist, both commits verified, content checks pass.
