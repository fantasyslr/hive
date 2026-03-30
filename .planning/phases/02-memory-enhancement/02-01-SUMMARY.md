---
phase: 02-memory-enhancement
plan: 01
subsystem: hive-memory
tags: [memory, sqlite, namespace, ttl, dedup, search-filters]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [memory-namespace, memory-ttl, memory-dedup, memory-filtered-search]
  affects: [hive-memory, shared-types]
tech_stack:
  added: []
  patterns: [tdd-red-green-refactor, sqlite-migration, content-deduplication]
key_files:
  created: []
  modified:
    - packages/hive-memory/src/store.ts
    - packages/hive-memory/src/store.test.ts
    - packages/shared/src/types.ts
    - packages/hive-memory/package.json
decisions:
  - MemoryRecord/SearchHit/SearchFilter types added to @hive/shared for cross-package use
  - Dedup uses embedding.score() (combined vector+token similarity) rather than raw cosine similarity
  - Dedup only active when namespace is non-empty (backward compatible)
  - TTL comparison uses ISO string comparison rather than SQLite datetime() for consistency
metrics:
  duration: 385s
  completed: "2026-03-30T15:29:47Z"
---

# Phase 02 Plan 01: Memory Store Enhancement Summary

Extended SQLite memory store with namespace, source metadata (agentId/taskId), TTL expiration, content deduplication, and filtered search -- foundational primitives for all MEM requirements.

## Tasks Completed

| Task | Name | Commit(s) | Key Changes |
|------|------|-----------|-------------|
| 1 | Extend MemoryRecord types and SQLite schema | 28402b9 (RED), 626834d (GREEN) | namespace/agentId/taskId/expiresAt fields, filtered search, TTL expiry |
| 2 | Content deduplication | 2119533 (RED), 628f205 (GREEN), 5f1e850 (REFACTOR) | findDuplicate() with 0.85 threshold, add() dedup in same namespace |

## What Changed

### packages/shared/src/types.ts
- Added `MemoryRecord` interface with `namespace`, `agentId?`, `taskId?`, `expiresAt?` fields
- Added `SearchHit` extending MemoryRecord with `score`
- Added `SearchFilter` interface (`namespace?`, `agentId?`, `after?`, `before?`)

### packages/hive-memory/src/store.ts
- SQLite schema: added `namespace`, `agent_id`, `task_id`, `expires_at` columns with migration logic
- `add()`: accepts namespace, agentId, taskId, ttlMs; computes expiresAt from ttlMs
- `add()`: deduplication -- checks for similar content (>0.85 similarity) in same namespace, updates instead of inserting
- `search()`: accepts optional `SearchFilter`; builds dynamic WHERE clause for namespace, agentId, time range; excludes expired entries
- `findDuplicate()`: public method for namespace-scoped content similarity matching
- `rowToRecord()`: helper to map SQLite rows to MemoryRecord with camelCase fields
- Added `@hive/shared` as workspace dependency

### packages/hive-memory/src/store.test.ts
- 13 new tests (8 for Task 1, 5 for Task 2) covering:
  - Namespace/agentId/taskId field storage and retrieval
  - Default namespace (backward compatibility)
  - TTL expiry (before/after sleep)
  - Non-expiring entries
  - Filtered search by namespace, agentId, time range
  - Content dedup: identical, similar, cross-namespace, dissimilar
- All 19 tests passing (6 existing + 13 new)

## Decisions Made

1. **Types in shared package**: MemoryRecord, SearchHit, SearchFilter exported from `@hive/shared` so future packages (MCP server, gateway) can import them
2. **Dedup scoring**: Uses `embedding.score()` (combined vector + token + exact match) rather than raw cosine similarity for more robust duplicate detection
3. **Dedup scope**: Only active when namespace is non-empty -- entries without namespace are never deduped (backward compatible)
4. **ISO string TTL comparison**: Uses parameterized ISO string comparison (`expires_at > ?`) instead of SQLite `datetime('now')` for consistency with app-layer timestamps

## Verification

- 19/19 store tests pass
- 102/102 main repo tests pass (20 test files)
- Pre-existing failures (5 in worktree copies of hive-gw) unaffected

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @hive/shared workspace dependency to hive-memory**
- **Found during:** Task 1
- **Issue:** store.ts imports from `@hive/shared` but package.json didn't list it as dependency
- **Fix:** Added `"@hive/shared": "*"` to dependencies
- **Files modified:** packages/hive-memory/package.json

**2. [Rule 1 - Bug] Adjusted dedup test strings for realistic similarity threshold**
- **Found during:** Task 2
- **Issue:** Short test strings "alpha beta" vs "alpha beta gamma" had 0.78 cosine similarity, below 0.85 threshold
- **Fix:** Used longer, more realistic strings that cross the 0.85 threshold
- **Files modified:** packages/hive-memory/src/store.test.ts

## Known Stubs

None -- all features are fully wired with real data paths.

## Self-Check: PASSED

All 4 files found. All 5 commits verified.
