---
phase: 03-campaign-templates
plan: 01
subsystem: api
tags: [templates, json-loader, fs-watch, hot-reload, dependency-enforcement]

requires:
  - phase: 01-api-auth
    provides: "camelCase Task type, auth middleware, task routes"
provides:
  - "CampaignTemplate and CampaignTemplateTask types in @hive/shared"
  - "Template loader service with fs.watch hot-reload"
  - "campaign.json default template with 4-task dependency DAG"
  - "Dependency enforcement in claim route (409 for unmet deps)"
affects: [03-02-campaign-templates]

tech-stack:
  added: []
  patterns: [fs.watch-directory-watcher, dependency-blocked-claim]

key-files:
  created:
    - packages/hive-gw/src/services/template-loader.ts
    - packages/hive-gw/src/services/template-loader.test.ts
    - packages/hive-gw/templates/campaign.json
    - packages/hive-gw/src/routes/task-deps.test.ts
  modified:
    - packages/shared/src/types.ts
    - packages/shared/src/schemas.ts
    - packages/hive-gw/src/services/task-machine.ts
    - packages/hive-gw/src/routes/tasks.ts

key-decisions:
  - "Template loader watches entire directory (not individual files) for add/remove/change detection"
  - "dependsOn stores task IDs (not titles) for runtime enforcement; template uses titles for authoring"

patterns-established:
  - "Directory watcher pattern: fs.watch on dir with 500ms debounce, full re-scan on change"
  - "Dependency gate pattern: check dependsOn before claim, return 409 with unmetDependencies list"

requirements-completed: [TMPL-02, TMPL-03]

duration: 3min
completed: 2026-03-31
---

# Phase 03 Plan 01: Campaign Template Infrastructure Summary

**JSON template loader with fs.watch hot-reload, campaign.json DAG (4 tasks), and dependency-blocked claim route returning 409**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-31T02:23:08Z
- **Completed:** 2026-03-31T02:26:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- CampaignTemplate/CampaignTemplateTask types exported from @hive/shared
- Template loader reads all .json files from a directory, stores in Map, hot-reloads via fs.watch with 500ms debounce
- campaign.json with 4-task DAG: Market Research -> (Ad Strategy + Creative Assets) -> Manager Review
- Claim route checks dependsOn array and returns 409 Conflict with unmetDependencies when predecessors not done
- dependsOn field wired through Task interface, CreateTaskSchema, and TaskMachine.create()

## Task Commits

Each task was committed atomically:

1. **Task 1: Campaign template types, JSON loader with hot-reload, and default template** - `e331ee7` (feat) - pre-existing commit
2. **Task 2: Dependency enforcement in claim route** - `7225f63` (feat)

## Files Created/Modified
- `packages/shared/src/types.ts` - Added CampaignTemplate, CampaignTemplateTask interfaces and dependsOn to Task
- `packages/shared/src/schemas.ts` - Added dependsOn validation to CreateTaskSchema
- `packages/hive-gw/src/services/template-loader.ts` - JSON template loader with fs.watch hot-reload
- `packages/hive-gw/src/services/template-loader.test.ts` - 4 tests for template loading
- `packages/hive-gw/templates/campaign.json` - Default campaign template with 4-task DAG
- `packages/hive-gw/src/services/task-machine.ts` - Spread dependsOn in create()
- `packages/hive-gw/src/routes/tasks.ts` - Dependency check before claim (409 for unmet)
- `packages/hive-gw/src/routes/task-deps.test.ts` - 4 tests for dependency enforcement

## Decisions Made
- Template loader watches the directory (not individual files) so it can detect new/removed templates
- dependsOn in Task stores task IDs for runtime; campaign.json template uses task titles for human authoring (Plan 02 will map titles to IDs at creation time)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] dependsOn not spread in TaskMachine.create()**
- **Found during:** Task 2
- **Issue:** TaskMachine.create() accepted dependsOn in params but never included it in the task object
- **Fix:** Added `...(params.dependsOn && { dependsOn: params.dependsOn })` spread
- **Files modified:** packages/hive-gw/src/services/task-machine.ts
- **Verification:** All 4 task-deps tests pass
- **Committed in:** 7225f63

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for dependsOn to work at all. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Template infrastructure ready for Plan 02 (campaign creation endpoint that instantiates tasks from template)
- Template loader can be started in server.ts alongside prompt watcher
- Dependency enforcement active for any task with dependsOn field

---
*Phase: 03-campaign-templates*
*Completed: 2026-03-31*
