---
phase: 01-api-stabilization-auth
plan: 03
subsystem: hive-gw/routes
tags: [auth, visibility, role-based-access]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [role-scoped-task-listing, role-scoped-board-snapshot]
  affects: [GET /tasks, GET /board]
tech_stack:
  added: []
  patterns: [role-based-filter-util, shared-util-extraction]
key_files:
  created:
    - packages/hive-gw/src/utils/task-visibility.ts
    - packages/hive-gw/src/routes/tasks-visibility.test.ts
  modified:
    - packages/hive-gw/src/routes/tasks.ts
    - packages/hive-gw/src/routes/board.ts
decisions:
  - filterTasksByRole extracted to shared util rather than duplicated in both routes
  - GET /:id single-task access not filtered (intentional — visibility applies to list views only)
metrics:
  duration: 161s
  completed: "2026-03-30T15:17:00Z"
  tasks: 2
  files: 4
---

# Phase 01 Plan 03: Role-Based Task Visibility Summary

Role-based visibility filter using filterTasksByRole util: manager sees all tasks, other roles see only own-created + assigned-to-me + unassigned pending tasks. Applied to both GET /tasks and GET /board.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add visibility filtering to GET /tasks and GET /board | 3ccf003 | task-visibility.ts, tasks.ts, board.ts |
| 2 | Test role-based task visibility | 8c30c2b | tasks-visibility.test.ts |

## Implementation Details

### filterTasksByRole (packages/hive-gw/src/utils/task-visibility.ts)

Central visibility function consumed by both routes:
- `manager` role: returns all tasks unfiltered
- Other roles: returns tasks matching `createdBy === user.id` OR `assignee === user.id` OR `(assignee === null && status === 'pending')`

### Route Changes

- **tasks.ts**: Visibility filter applied before status filter in GET /tasks handler
- **board.ts**: Visibility filter applied to task snapshot in GET /board handler
- Single-task access (GET /tasks/:id) intentionally unfiltered

## Verification

- TypeScript compiles clean (pre-existing feishu errors only)
- 10 new visibility tests all pass
- Full test suite: 20 files, 89 tests pass (was 19 files, 79 tests before)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

All 4 files verified on disk. Both commits (3ccf003, 8c30c2b) found in git log.
