# Phase 2: Memory Enhancement - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Every piece of team knowledge has a clear origin, lives in a proper namespace, avoids duplication, and expires when stale.

Success Criteria:
1. A memory entry created by agent X during task Y shows agentId and taskId in its metadata when retrieved
2. Memory entries have a dedicated namespace field; searching by namespace returns only entries in that namespace (no title-prefix parsing)
3. Writing a memory entry with similar content in the same namespace updates the existing entry instead of creating a duplicate
4. A memory entry created with a TTL is marked expired after that duration and excluded from search results
5. Memory search accepts filters for namespace, agentId, and time range, and returns only matching entries

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key context from prior research:
- Current memory uses hash-based 384-dim vectors with O(n) full scan — fine for MVP scale
- Namespace is currently a title prefix convention — needs dedicated field
- No source tracking, TTL, dedup, or FTS currently exists
- SQLite WAL is the storage backend — keep using it

</decisions>

<code_context>
## Existing Code Insights

Key files:
- packages/hive-memory/src/store.ts — SQLite store with memories table
- packages/hive-memory/src/embedding.ts — Hash-based embedding engine
- packages/hive-memory/src/server.ts — MCP server with memory_add/search/update tools
- packages/hive-gw/src/services/memory-service.ts — Gateway memory integration
- packages/hive-gw/src/services/memory-client.ts — MCP client to memory server

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
