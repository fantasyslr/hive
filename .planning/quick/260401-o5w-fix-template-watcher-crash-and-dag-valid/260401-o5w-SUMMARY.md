---
phase: quick
plan: 260401-o5w
subsystem: hive-gw/templates
tags: [bugfix, crash-prevention, dag-validation, template-loader]
dependency_graph:
  requires: []
  provides: [safe-template-watcher, dag-validation]
  affects: [template-loader, template-routes]
tech_stack:
  added: []
  patterns: [existsSync-guard, two-pass-validation]
key_files:
  created: []
  modified:
    - packages/hive-gw/src/services/template-loader.ts
    - packages/hive-gw/src/services/template-loader.test.ts
    - packages/hive-gw/src/routes/templates.ts
    - packages/hive-gw/src/routes/templates.test.ts
decisions:
  - existsSync guard before fs.watch to prevent ENOENT crash on missing templates/ dir
  - Two-pass DAG validation (duplicates then deps) before any task creation
  - Return { error } union type from launchTemplate instead of silent filter
metrics:
  duration: 134s
  completed: 2026-04-01
  tasks: 2
  files: 4
---

# Quick Task 260401-o5w: Fix Template Watcher Crash and DAG Validation Summary

existsSync guard prevents gateway crash on missing templates/ dir; two-pass DAG validation rejects unknown deps and duplicate titles instead of silently dropping edges.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Fix template watcher crash on missing directory | bb66c00 | PASS |
| 2 | Validate template DAG — reject unknown/duplicate titles | fde0a8f | PASS |

## What Changed

### Task 1: Template Watcher Crash Guard

**Problem:** `startTemplateWatcher()` unconditionally calls `fs.watch(dirPath)` which throws ENOENT on clean checkout where `templates/` doesn't exist, crashing the gateway process.

**Fix:** Added `existsSync(dirPath)` check before `watch()`. If directory missing, logs a warning and returns early. No crash, no watcher, `getAllTemplates()` returns `[]`.

**Tests added:** 2 new tests (missing dir no-throw, empty array after missing dir start).

### Task 2: DAG Validation in launchTemplate

**Problem:** `launchTemplate()` used `.filter()` to silently discard dependencies whose titles don't match any task. This hides template authoring errors and creates DAGs with missing edges.

**Fix:** Added two-pass validation before task creation:
1. Check for duplicate task titles in template
2. Verify every `dependsOn` title exists in the template's title set

Returns `{ error: string }` on validation failure. Route handler returns HTTP 400. No tasks are created if validation fails.

**Tests added:** 2 new tests (unknown dep returns error, duplicate title returns error). All 10 existing tests unchanged and passing.

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Verification

```
Test Files  2 passed (2)
     Tests  18 passed (18)
```

All 18 tests pass: 6 template-loader tests (4 existing + 2 new) and 12 template route tests (10 existing + 2 new).
