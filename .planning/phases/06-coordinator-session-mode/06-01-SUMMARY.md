---
phase: "06"
plan: "01"
subsystem: coordinator-session-mode
tags: [coordinator, batch-api, task-types, dependency-resolution]
dependency_graph:
  requires: []
  provides: [TaskKind-coordinate, TaskKind-synthesize, BatchCreateTasksSchema, POST-tasks-batch, setDependsOn]
  affects: [task-machine, tasks-router, shared-types, shared-schemas]
tech_stack:
  added: []
  patterns: [two-pass-batch-creation, title-to-id-resolution, atomic-rollback]
key_files:
  created:
    - packages/shared/src/schemas.test.ts
    - packages/hive-gw/src/routes/tasks-batch.test.ts
  modified:
    - packages/shared/src/types.ts
    - packages/shared/src/schemas.ts
    - packages/hive-gw/src/routes/tasks.ts
    - packages/hive-gw/src/services/task-machine.ts
decisions:
  - Two-pass batch creation pattern for title-to-ID dependency resolution
  - Atomic rollback on dependency resolution failure (delete created tasks)
  - runId defaults to parentTaskId when parent has no runId
  - createdBy set to 'coordinator' for all batch-created sub-tasks
metrics:
  duration_seconds: 222
  completed: "2026-04-01T06:26:54Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 13
---

# Phase 06 Plan 01: TaskKind Extension and Batch Sub-task Creation Summary

Extended TaskKind with coordinate/synthesize types and added POST /tasks/batch for atomic sub-task DAG creation with title-to-ID dependency resolution.

## What Was Done

### Task 1: Extend TaskKind and add BatchCreateTasksSchema
- Extended `TaskKind` union type with `'coordinate'` and `'synthesize'` values
- Created `BatchSubTaskSchema` (title, description, taskKind, requiredCapabilities, dependsOn as title refs)
- Created `BatchCreateTasksSchema` (parentTaskId + tasks array, 1-20 items)
- Both schemas exported via `@hive/shared` index
- 8 tests covering type validation, required fields, title-based dependsOn

**Commit:** `ed99f6d`

### Task 2: POST /tasks/batch route with title-to-ID dependency resolution
- Added `POST /tasks/batch` route to tasks router
- Two-pass creation: Pass 1 creates all tasks, Pass 2 resolves dependsOn titles to IDs
- Atomic rollback: if any dependsOn title not found in batch, all created tasks are deleted
- Independent tasks (no dependsOn) auto-assigned via dispatcher with task.assigned events
- Added `setDependsOn(taskId, deps)` method to TaskMachine for post-creation dep updates
- 5 tests covering happy path, dep resolution, 400 errors, and atomicity

**Commit:** `43e6e1e`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npx vitest run packages/shared` -- 8/8 passed
- `npx vitest run packages/hive-gw --exclude='**/integration-smoke*'` -- 1212/1212 passed
- `grep -c 'coordinate\|synthesize' packages/shared/src/types.ts` -- returns 2
- Integration-smoke tests have pre-existing ECONNRESET failures due to parallel agent port conflicts (not related to this plan)

## Known Stubs

None.

## Self-Check: PASSED

- All 6 key files: FOUND
- Commit ed99f6d: FOUND
- Commit 43e6e1e: FOUND
