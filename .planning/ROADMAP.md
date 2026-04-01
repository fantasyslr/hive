# Roadmap: Hive

## Milestones

- ✅ **v1.0 Backend Enhancement** - Phases 1-3 (shipped 2026-03-31)
- 🚧 **v2.0 Intelligence Layer** - Phases 4-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 Backend Enhancement (Phases 1-3) - SHIPPED 2026-03-31</summary>

### Phase 1: API Stabilization & Auth
**Goal**: API consumers (frontend, agents) interact with a consistent camelCase API protected by role-based Bearer tokens
**Depends on**: Nothing (first phase)
**Requirements**: API-01, AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Every API response field is camelCase -- no snake_case fields remain in any endpoint
  2. Requests without a valid Bearer token receive 401; requests with a valid token include user identity in the response context
  3. A user with role "主管" can see all tasks; a user with role "投放" sees only their own tasks and shared tasks
  4. Existing tests pass against the new field names (no silent breakage)
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Rename all snake_case fields to camelCase across shared types, schemas, services, routes, and tests (API-01)
- [x] 01-02-PLAN.md — Create Bearer token auth with 4 fixed users and apply middleware to all endpoints (AUTH-01, AUTH-02)
- [x] 01-03-PLAN.md — Add role-based task visibility scoping to GET /tasks and GET /board (AUTH-03)

### Phase 2: Memory Enhancement
**Goal**: Every piece of team knowledge has a clear origin, lives in a proper namespace, avoids duplication, and expires when stale
**Depends on**: Phase 1 (memory API fields must be camelCase; auth needed to track created_by user)
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05
**Success Criteria** (what must be TRUE):
  1. A memory entry created by agent X during task Y shows agentId and taskId in its metadata when retrieved
  2. Memory entries have a dedicated namespace field; searching by namespace returns only entries in that namespace (no title-prefix parsing)
  3. Writing a memory entry with similar content in the same namespace updates the existing entry instead of creating a duplicate
  4. A memory entry created with a TTL is marked expired after that duration and excluded from search results
  5. Memory search accepts filters for namespace, agentId, and time range, and returns only matching entries
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Extend SQLite store with namespace column, agentId/taskId source tracking, TTL expiration, content dedup, and filtered search
- [x] 02-02-PLAN.md — Wire new store features through MCP server tools, shared schemas, Gateway MemoryService, and search route

### Phase 3: Campaign Templates
**Goal**: A manager can launch a structured campaign that automatically creates role-specific sub-tasks with the right ordering
**Depends on**: Phase 2 (campaign outputs should write to memory with proper source tracking)
**Requirements**: TMPL-01, TMPL-02, TMPL-03
**Success Criteria** (what must be TRUE):
  1. Creating a task from the "Campaign" template produces a parent task and one sub-task per role (投放, 运营, 素材) with correct assignments
  2. Sub-tasks have dependency ordering enforced -- a dependent sub-task cannot be claimed until its predecessor is done
  3. Templates are stored as JSON config files and can be modified without restarting the server
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Template types, JSON loader with hot-reload, dependency enforcement in claim route (TMPL-02, TMPL-03)
- [x] 03-02-PLAN.md — Template instantiation route: launch campaign creating parent + sub-tasks with resolved deps (TMPL-01)

</details>

### 🚧 v2.0 Intelligence Layer (In Progress)

**Milestone Goal:** Transform Hive from a passive dispatch board into an active intelligence platform — upgrade worker from shell wrapper to typed runtime, add structured memory extraction with history injection, enable complex task decomposition, and wire everything with declarative hooks.

**Design inspiration:** Claude Code source (instructkr/claude-code, freestylefly/claude-code) — worker runtime with tool registry, session memory with structured extraction, coordinator-worker pattern, declarative hook lifecycle.

- [ ] **Phase 4: Worker Runtime Foundation** - Typed adapter layer, tool registry, structured result contracts, worker capability model
- [ ] **Phase 5: Structured Memory + History Injection** - LLM-extracted conclusions, dual-channel retrieval, side query pattern, history context injection
- [ ] **Phase 6: Coordinator + Session Mode** - Task decomposition into sub-task DAGs, result synthesis, persistent worker sessions
- [ ] **Phase 7: Hook Engine** - Declarative event-driven actions via JSON config, hot-reload

## Phase Details

### Phase 4: Worker Runtime Foundation
**Goal**: Workers are typed runtime clients with self-describing capabilities and structured output — not shell wrappers calling CLI commands
**Depends on**: Phase 3 (stable task system and memory infrastructure)
**Requirements**: WKRT-01, WKRT-02, WKRT-03, WKRT-04
**Success Criteria** (what must be TRUE):
  1. worker-adapter.sh is replaced by a TypeScript module with typed interface (startSession, runTask, cancelTask, collectResult) — each harness (Claude, Codex, Gemini) implements the same interface
  2. Each harness adapter declares a capability profile (supportsStreaming, supportsPersistentSession, supportsPlanMode, supportsStructuredOutput) — dispatcher can query these capabilities
  3. Task completion produces a structured result object with typed fields (conclusion, decisionReason, keyFindings, artifacts) — not raw stdout text
  4. A tool registry exists where worker tools (memory.search, memory.write, task.create, board.read, feishu.send) are registered as self-describing objects with capability flags (isReadOnly, isConcurrencySafe)
  5. Existing worker-bridge.ts tests pass against the new adapter layer — no regression in task execution flow
**Plans:** 4 plans

Plans:
- [x] 04-01-PLAN.md — Package scaffold + type contracts (HarnessAdapter, StructuredResult, ToolDefinition) + AgentCard extension (WKRT-01, WKRT-02, WKRT-03, WKRT-04)
- [x] 04-02-PLAN.md — Three harness adapters (Claude, Gemini, Codex) + extractStructuredResult utility (WKRT-01, WKRT-02, WKRT-03)
- [x] 04-03-PLAN.md — Two-layer tool registry + gateway AgentRegistry harness metadata (WKRT-04)
- [x] 04-04-PLAN.md — Worker bridge rewrite to use typed adapters + delete bash adapter (WKRT-01, WKRT-03)

### Phase 5: Structured Memory + History Injection
**Goal**: Every completed task produces structured knowledge that future tasks automatically receive as context — the team genuinely never starts from scratch
**Depends on**: Phase 4 (structured result contract provides clean input for LLM extraction; tool registry enables memory tools)
**Requirements**: SMEM-01, SMEM-02, HINJ-01, HINJ-02, HINJ-03
**Success Criteria** (what must be TRUE):
  1. When a task transitions to "done", a lightweight LLM call (side query, not full agent) extracts structured conclusion fields from the result — extraction failure is logged but never blocks task completion
  2. Extracted conclusions are stored with all fields individually searchable in memory — searching by reusableFor tag returns matching entries
  3. Before task assignment, the system searches memory for top-3 related conclusions and attaches them to contextRef
  4. An agent claiming a task sees injected historical conclusions in the task payload — actionable context, not hidden metadata
  5. When cosine scores are low, LLM fallback selection finds semantically related conclusions that vector search missed
  6. Tasks with no relevant history proceed normally with empty contextRef — injection never blocks assignment
**Plans**: TBD

### Phase 6: Coordinator + Session Mode
**Goal**: Complex goals decompose into ordered sub-task DAGs that execute and synthesize results automatically; workers can maintain context across consecutive tasks
**Depends on**: Phase 5 (coordinator benefits from history injection on sub-tasks; session mode builds on typed runtime from Phase 4)
**Requirements**: CORD-01, CORD-02, CORD-03, CORD-04
**Success Criteria** (what must be TRUE):
  1. A task with taskKind "coordinate" triggers decomposition into sub-tasks with dependsOn graph — user submits one goal, sees multiple sub-tasks on the board
  2. A single API call creates multiple sub-tasks with their dependency graph — no sequential individual creates needed
  3. When all sub-tasks of a coordinate task reach "done", a synthesize task is auto-created that aggregates results
  4. A worker in persistent session mode maintains context across consecutive tasks in the same runId — explore → execute → fix → verify without cold restart between steps
  5. One-shot mode remains default for simple tasks; persistent mode is opt-in per taskKind or explicit flag
**Plans**: TBD

### Phase 7: Hook Engine
**Goal**: Lifecycle behaviors (notifications, task chaining, context injection) are defined declaratively in JSON config — the team adds automations without touching code
**Depends on**: Phase 6 (hook engine wires up all prior features; needs stable task/memory/coordinator substrate)
**Requirements**: HOOK-01, HOOK-02, HOOK-03
**Success Criteria** (what must be TRUE):
  1. A JSON config file defines hooks as {on: event, if: condition, action: handler} — adding a new automation requires only config, not code
  2. Hook actions support: http (POST to external URL like Feishu webhook), create_task (chain a follow-up task), memory_search (inject context from memory)
  3. Editing the hook config file takes effect without restarting the server — hot-reload within seconds
  4. Existing hardcoded behaviors (VerifyLoop, DependencyUnblocker) continue working alongside declarative hooks — migration is incremental
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. API Stabilization & Auth | v1.0 | 3/3 | Complete | 2026-03-30 |
| 2. Memory Enhancement | v1.0 | 2/2 | Complete | 2026-03-31 |
| 3. Campaign Templates | v1.0 | 2/2 | Complete | 2026-03-31 |
| 4. Worker Runtime Foundation | v2.0 | 0/4 | Planning complete | - |
| 5. Structured Memory + History Injection | v2.0 | 0/? | Not started | - |
| 6. Coordinator + Session Mode | v2.0 | 0/? | Not started | - |
| 7. Hook Engine | v2.0 | 0/? | Not started | - |
