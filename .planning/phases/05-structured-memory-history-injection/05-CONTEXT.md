# Phase 5: Structured Memory + History Injection - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade Hive's memory layer from raw text storage to structured knowledge extraction with automatic history injection. When a task completes, an LLM side query extracts structured conclusion fields. Before task assignment, the system searches memory for related conclusions and injects them into the task payload. This is the "never start from scratch" promise.

</domain>

<decisions>
## Implementation Decisions

### LLM Side Query Strategy
- **D-01:** Use Haiku for side query extraction — cheapest, fastest, extraction is straightforward summarization.
- **D-02:** Extraction triggers in `MemoryService.registerHooks()` on `task.completed` event — existing hook already fires `writeConclusion()`, add LLM extraction there.
- **D-03:** Extraction failure logs error + stores rawFallback (conclusion=raw, empty fields) — never blocks task completion per SMEM-01.
- **D-04:** Extend existing `extractStructuredResult()` from `@hive/worker` with optional LLM pass — add `extractWithLLM(raw, llmClient): Promise<StructuredResult>` that calls Haiku when JSON parse fails. D-11 from Phase 4 designed it as reusable.

### Memory Schema & Storage
- **D-05:** Extend `MemoryConclusion` in `@hive/shared` with `reusableFor: string[]`, `keyFindings: string[]` fields from StructuredResult — individual field searchability.
- **D-06:** Store via MCP `memory_add` with `content` JSON containing all fields + `tags` param for filtered search on `reusableFor`.
- **D-07:** Dedup by taskId namespace — same task always produces one conclusion entry. Overwrite on re-extraction (existing pattern in `writeConclusion`).

### History Injection Strategy
- **D-08:** Injection happens in `Dispatcher.tryAssign()` before `claim()` — search memory, attach to task `contextRef` before agent sees it.
- **D-09:** Change `contextRef` from single string to `contextRef: string | HistoryContext[]` — backward compatible. `HistoryContext` = `{ taskId, conclusion, decisionReason, reusableFor, similarity }`.
- **D-10:** Cosine score < 0.3 triggers LLM re-ranking of top-10 vector candidates — low enough to avoid false positives, wide enough candidate pool for HINJ-03 dual-channel.
- **D-11:** No relevant history → empty `contextRef`, task proceeds normally. No placeholder text. Per HINJ requirement.

### Claude's Discretion
- LLM prompt template for Haiku extraction (what to ask for, format instructions)
- Error retry strategy for LLM calls (single attempt or exponential backoff)
- Memory search query construction (title+description concatenation vs. weighted fields)
- Test fixtures and mock strategy for LLM-dependent tests

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MemoryService.writeConclusion(task)` — already fires on task.completed, writes to MCP memory. Extend with LLM extraction step.
- `MemoryService.search(query, options)` — existing memory search with namespace/agentId/time filters. Use for history retrieval.
- `extractStructuredResult(raw)` in `@hive/worker` — Phase 4 two-pass extraction (JSON parse → rawFallback). Extend with LLM pass.
- `MemoryConclusion` interface in `@hive/shared` — has taskId, agentId, conclusion, decisionReason, impactScope, timestamp, namespace.

### Established Patterns
- Event-driven hooks via `EventBus` — `task.completed` / `task.failed` / `task.updated` events
- Fire-and-forget async in hooks (`.then().catch()`) — non-blocking
- MCP client for memory backend — `callTool(name, args)` pattern
- `MEMORY_NAMESPACES.PUBLIC_CONCLUSIONS` for shared knowledge

### Integration Points
- `Dispatcher.tryAssign()` — claim flow, where injection inserts before agent gets task
- `Task.contextRef` — currently optional string, needs schema change for structured history
- `MemoryService.registerHooks()` — where extraction hooks live
- `@hive/worker/extract-result.ts` — where LLM pass gets added

</code_context>

<specifics>
## Specific Ideas

- Haiku side query uses the same pattern as CC source `sideQuery()` — lightweight LLM call separate from the main agent executor.
- `extractWithLLM()` should be a thin wrapper: format prompt → call Haiku → parse response → validate against StructuredResult schema.
- Memory search for injection uses title+description as query — same approach as existing `MemoryService.search()`.
- Top-3 results sorted by similarity score, attached as `HistoryContext[]` to contextRef.

</specifics>

<deferred>
## Deferred Ideas

- Memory staleness warnings (auto-caveat for old conclusions) — future requirement
- Agent memory scoping (global / board / task-local isolation) — future requirement
- Context compaction for persistent sessions — Phase 6
- Full-text search on memory — hash embedding O(n) fine for MVP scale

</deferred>

---

*Phase: 05-structured-memory-history-injection*
*Context gathered: 2026-04-01 via smart discuss (autonomous)*
