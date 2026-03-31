---
phase: 03-campaign-templates
plan: 02
subsystem: api
tags: [templates, launch, task-tree, dependency-resolution, auto-assign]

requires:
  - phase: 03-campaign-templates
    plan: 01
    provides: "Template loader, campaign.json, dependency enforcement in claim"
provides:
  - "GET /templates and GET /templates/:id routes"
  - "POST /templates/:id/launch — creates parent task + role-specific sub-tasks"
  - "Title-to-ID dependency resolution in launched sub-tasks"
  - "Auto-assignment of independent sub-tasks via dispatcher"
affects: []

tech-stack:
  added: []
  patterns: [template-launch-task-tree, title-to-id-dep-resolution]

key-files:
  created:
    - packages/hive-gw/src/routes/templates.ts
    - packages/hive-gw/src/routes/templates.test.ts
  modified:
    - packages/hive-gw/src/index.ts

key-decisions:
  - "launchTemplate() extracted as pure function for testability — takes TaskMachine and Dispatcher as args"
  - "Template launch creates parent task with taskKind 'plan' and requiredCapabilities ['orchestration']"
  - "dependsOn resolution maps template titles to actual task IDs in creation order"

patterns-established:
  - "Template launch pattern: parent task + ordered sub-task creation with title-to-ID map"
  - "Route logic extraction: core logic in exported function, Express handler is thin wrapper"

requirements-completed: [TMPL-01]

duration: 4min
completed: 2026-03-31
---

# Phase 03 Plan 02: Template Launch Route Summary

**POST /templates/:id/launch creates parent task + 4 sub-tasks with title-to-ID dependency resolution and auto-assignment of independent tasks**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-31T02:27:23Z
- **Completed:** 2026-03-31T02:31:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- GET /templates returns all loaded templates, GET /templates/:id returns single template or 404
- POST /templates/:id/launch creates a parent task (taskKind: plan) and sub-tasks from the template
- Sub-tasks get parentTaskId linking to the parent, and dependsOn resolved from template title references to actual task IDs
- Sub-tasks with empty dependsOn are auto-assigned by the dispatcher
- launchTemplate() extracted as a testable function accepting TaskMachine and Dispatcher
- Zod validation on launch body (optional name/description overrides)
- 10 tests covering list, get, launch, parentTaskId, dependsOn resolution, and error cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Template routes -- list, get, and launch campaign** - `110092a` (feat)
2. **Task 2: Wire templates into Express app and start template watcher** - `da2f033` (feat)

## Files Created/Modified
- `packages/hive-gw/src/routes/templates.ts` - Template routes: GET list, GET by id, POST launch with task tree creation
- `packages/hive-gw/src/routes/templates.test.ts` - 10 tests for template route behaviors
- `packages/hive-gw/src/index.ts` - Mount templatesRouter at /templates, start template watcher during init

## Decisions Made
- launchTemplate() extracted as pure function for testability (takes TaskMachine/Dispatcher as args, no global state)
- Parent task uses taskKind "plan" and requiredCapabilities ["orchestration"]
- Title-to-ID resolution processes template tasks in array order, building map as it goes

## Deviations from Plan

None - plan executed exactly as written. Note: Task 1 was partially completed by a prior agent (commit 110092a already on master). Task 2 changes were staged but uncommitted; this execution verified and committed them.

## Known Stubs

None - all routes are fully wired with real data from template-loader.

## Self-Check: PASSED

---
*Phase: 03-campaign-templates*
*Completed: 2026-03-31*
