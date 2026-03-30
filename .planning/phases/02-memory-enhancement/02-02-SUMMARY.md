---
phase: 02-memory-enhancement
plan: 02
subsystem: hive-memory, hive-gw, shared
tags: [mcp-tools, memory-search, namespace, filters, gateway]
dependency_graph:
  requires: [02-01]
  provides: [mcp-namespace-filter, gateway-memory-filters, search-route-filters]
  affects: [hive-memory, hive-gw, shared]
tech_stack:
  added: []
  patterns: [tdd-red-green, filter-passthrough, legacy-alias-mapping]
key_files:
  created: []
  modified:
    - packages/hive-memory/src/server.ts
    - packages/hive-memory/src/server.test.ts
    - packages/shared/src/schemas.ts
    - packages/hive-gw/src/services/memory-service.ts
    - packages/hive-gw/src/routes/memory.ts
    - packages/hive-gw/src/services/memory-service.test.ts
decisions:
  - SearchFilter built only when at least one filter param is defined (avoids empty object overhead)
  - Legacy namespace aliases "public" and "agent" mapped in Gateway MemoryService for backward compat
  - MemorySearchSchema namespace changed from enum to free-form string to support arbitrary namespaces
  - taskId validation uses z.string().uuid() on MCP tool (strict) matching store expectations
metrics:
  duration: 276s
  completed: "2026-03-30T15:37:00Z"
---

# Phase 02 Plan 02: MCP Tool & Gateway Wiring Summary

Wired enhanced store capabilities (namespace, source tracking, TTL, filtered search) through MCP server tools, shared schemas, Gateway MemoryService, and search route -- agents can now use namespace filtering, source metadata, and time range queries via both MCP protocol and HTTP API.

## Tasks Completed

| Task | Name | Commit(s) | Key Changes |
|------|------|-----------|-------------|
| 1 | Update MCP server tools and shared schema | 09c45ad (RED), 4320763 (GREEN) | memory_add accepts namespace/agentId/taskId/ttlMs, memory_search accepts namespace/agentId/after/before filters, MemorySearchSchema updated |
| 2 | Update Gateway MemoryService and search route | c564cd0 | writeConclusion/writeProcess pass dedicated fields, search uses filter object, route extracts filter query params |

## What Changed

### packages/hive-memory/src/server.ts
- `memory_add` tool: added `namespace`, `agentId`, `taskId`, `ttlMs` to inputSchema; all passed through to `store.add()`
- `memory_search` tool: added `namespace`, `agentId`, `after`, `before` to inputSchema; builds `SearchFilter` and passes to `store.search()`
- Import added for `SearchFilter` type from `@hive/shared`

### packages/hive-memory/src/server.test.ts
- 5 new integration tests via MCP client: add with all new params, add backward compat, search with namespace filter, search with agentId filter, search backward compat
- All 8 server tests passing

### packages/shared/src/schemas.ts
- `MemorySearchSchema.namespace` changed from `z.enum(['public', 'agent']).default('public')` to `z.string().max(256).optional()`
- Added `agentId`, `after`, `before` fields to `MemorySearchSchema`

### packages/hive-gw/src/services/memory-service.ts
- `writeConclusion()`: now passes `namespace: 'public/conclusions'`, `agentId`, `taskId` as dedicated MCP tool args (no longer only in title)
- `writeProcess()`: now passes `namespace: 'agent/{agentId}'`, `agentId`, `taskId` as dedicated MCP tool args
- `search()`: signature changed from `(query, namespace, limit)` to `(query, options?)` with `{namespace, agentId, after, before, limit}`
- Removed title-prefix namespace hack (`scopedQuery = pathPrefix + query`)
- Legacy alias mapping preserved: "public" -> "public/conclusions", "agent" -> "agent"

### packages/hive-gw/src/routes/memory.ts
- Route extracts `agentId`, `after`, `before` from query params
- Passes all filter fields through MemorySearchSchema validation
- Calls `memoryService.search(query, { namespace, agentId, after, before, limit })`
- Updated JSDoc to reflect new filter-based approach

### packages/hive-gw/src/services/memory-service.test.ts
- 7 tests (was 2): namespace passthrough (public, agent), agentId filter, after/before filter, default options, writeConclusion args, writeProcess args
- Tests verify dedicated filter fields are passed instead of query-prefix hack

## Decisions Made

1. **Filter object pattern**: SearchFilter built only when at least one filter param is defined, passed as `undefined` otherwise to avoid unnecessary empty-object overhead in store
2. **Legacy alias mapping**: "public" and "agent" short aliases resolved in Gateway MemoryService (not in MCP tool), preserving backward compat for existing callers
3. **Free-form namespace**: MemorySearchSchema namespace changed from 2-value enum to arbitrary string, enabling nested namespaces like "agent/planner"
4. **Strict UUID validation**: taskId uses `z.string().uuid()` on MCP tool, matching zod/v4's RFC 4122 UUID format

## Verification

- 222/222 tests pass (40 test files)
- All 8 server tests pass (3 existing + 5 new)
- All 7 memory-service tests pass (replaced 2 old with 7 new)
- No regressions in any other test file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test UUID for zod/v4 strict validation**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test used `00000000-0000-0000-0000-000000000001` which is not a valid RFC 4122 UUID (wrong version/variant nibbles)
- **Fix:** Changed to `a0000000-0000-4000-8000-000000000001` (valid UUID v4)
- **Files modified:** packages/hive-memory/src/server.test.ts
- **Commit:** 4320763

## Known Stubs

None -- all features are fully wired with real data paths end-to-end.

## Self-Check: PASSED
