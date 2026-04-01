# Requirements: Hive v2.0 Intelligence Layer

**Defined:** 2026-03-31
**Core Value:** Every task's process and output is captured in shared memory, so the team never starts from scratch on similar work again.

## v2 Requirements

### Worker Runtime

- [x] **WKRT-01**: Worker adapter is a TypeScript module (not bash script) with typed interface: startSession(), runTask(), cancelTask(), collectResult()
- [x] **WKRT-02**: Each harness (Claude, Codex, Gemini) declares capabilities via a typed profile: supportsStreaming, supportsPersistentSession, supportsPlanMode, supportsStructuredOutput
- [x] **WKRT-03**: Task completion produces a structured result object (conclusion, decisionReason, keyFindings, artifacts) per taskKind — not raw text
- [x] **WKRT-04**: Tool registry exposes available worker tools (memory.search, memory.write, task.create, board.read, feishu.send) as self-describing objects with capability declarations (isReadOnly, isConcurrencySafe)

### Structured Memory

- [x] **SMEM-01**: Task completion triggers LLM extraction (via side query) of structured conclusion from task result — extraction failure never blocks task flow
- [x] **SMEM-02**: Structured conclusions stored in memory with all extracted fields individually searchable (conclusion, decisionReason, keyFindings, reusableFor)

### History Injection

- [x] **HINJ-01**: Before task assignment, system auto-searches related historical conclusions using title+description (top-3)
- [x] **HINJ-02**: Matched historical conclusions injected into task contextRef so agents see prior work in task payload
- [x] **HINJ-03**: Dual-channel retrieval — cosine fast path + LLM selection fallback for low-score results

### Coordinator Agent

- [x] **CORD-01**: New taskKind values `coordinate` and `synthesize` for task decomposition and result aggregation
- [x] **CORD-02**: Batch sub-task creation API — single POST creates multiple tasks with dependsOn relationships
- [ ] **CORD-03**: Auto-create synthesize task when all sub-tasks of a coordinate task complete
- [x] **CORD-04**: Worker supports persistent session mode — consecutive tasks (explore → execute → fix → verify) share context without cold restart

### Hook Engine

- [ ] **HOOK-01**: Declarative hook definitions via JSON config (on event + if condition + action)
- [ ] **HOOK-02**: Action types: http (webhook POST), create_task (chain tasks), memory_search (inject context)
- [ ] **HOOK-03**: Hook config hot-reload — file changes apply without server restart

## Future Requirements

- Full-text search on memory — hash embedding O(n) scan fine for ~1000 entries
- Context compaction for persistent worker sessions — multi-level (micro → session memory → full)
- Worker permission model — tool gating per role/taskKind
- Template editor UI — JSON config manually edited for now
- Agent memory scoping — global / board / task-local isolation
- Memory staleness warnings — auto-caveat for old conclusions
- Team memory sync — delta push with SHA256 hash comparison

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant / SaaS | Single team, internal tool |
| Mobile app | Web only |
| Complex RBAC | 4 users, role field is enough |
| Real vector DB (Pinecone etc.) | SQLite + hash embedding sufficient at team scale |
| Agent sandboxing | Trust boundary unnecessary for internal tool |
| Fork/worktree agent spawn modes | CC-specific, Hive uses HTTP-based agent dispatch |
| Prompt cache optimization | Single-request workers, no multi-turn cache to optimize |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WKRT-01 | Phase 4 | Complete |
| WKRT-02 | Phase 4 | Complete |
| WKRT-03 | Phase 4 | Complete |
| WKRT-04 | Phase 4 | Complete |
| SMEM-01 | Phase 5 | Complete |
| SMEM-02 | Phase 5 | Complete |
| HINJ-01 | Phase 5 | Complete |
| HINJ-02 | Phase 5 | Complete |
| HINJ-03 | Phase 5 | Complete |
| CORD-01 | Phase 6 | Complete |
| CORD-02 | Phase 6 | Complete |
| CORD-03 | Phase 6 | Pending |
| CORD-04 | Phase 6 | Complete |
| HOOK-01 | Phase 7 | Pending |
| HOOK-02 | Phase 7 | Pending |
| HOOK-03 | Phase 7 | Pending |

**Coverage:**
- v2 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-04-01 after roadmap revision (CC source code deep dive)*
