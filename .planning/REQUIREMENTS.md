# Requirements: Hive v2.0 Intelligence Layer

**Defined:** 2026-03-31
**Core Value:** Every task's process and output is captured in shared memory, so the team never starts from scratch on similar work again.

## v2 Requirements

### Structured Memory

- [ ] **SMEM-01**: Task completion triggers LLM extraction of structured conclusion (conclusion, decisionReason, keyFindings, reusableFor) from task.result
- [ ] **SMEM-02**: Structured conclusions stored in memory with all extracted fields searchable

### History Injection

- [ ] **HINJ-01**: Before task assignment, system auto-searches related historical conclusions using title+description (top-3)
- [ ] **HINJ-02**: Matched historical conclusions injected into task contextRef so agents see prior work
- [ ] **HINJ-03**: Dual-channel retrieval — cosine fast path + LLM selection fallback for low-score results

### Coordinator Agent

- [ ] **CORD-01**: New taskKind values `coordinate` and `synthesize` for task decomposition and result aggregation
- [ ] **CORD-02**: Batch sub-task creation API — single POST creates multiple tasks with dependsOn relationships
- [ ] **CORD-03**: Auto-create synthesize task when all sub-tasks of a coordinate task complete

### Hook Engine

- [ ] **HOOK-01**: Declarative hook definitions via JSON config (on event + if condition + action)
- [ ] **HOOK-02**: Action types: http (webhook POST), create_task (chain tasks), memory_search (inject context)
- [ ] **HOOK-03**: Hook config hot-reload — file changes apply without server restart

## Future Requirements

- Full-text search on memory — hash embedding O(n) scan fine for ~1000 entries
- Template editor UI — JSON config manually edited for now
- Memory garbage collection — TTL marks expired but no auto-delete
- Budget/cost tracking — requires LLM provider usage APIs
- Agent capability auto-discovery — agents self-declare tools and limits

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant / SaaS | Single team, internal tool |
| Mobile app | Web only |
| Complex RBAC | 4 users, role field is enough |
| Real vector DB (Pinecone etc.) | SQLite + hash embedding sufficient at team scale |
| Agent sandboxing | Trust boundary unnecessary for internal tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SMEM-01 | — | Pending |
| SMEM-02 | — | Pending |
| HINJ-01 | — | Pending |
| HINJ-02 | — | Pending |
| HINJ-03 | — | Pending |
| CORD-01 | — | Pending |
| CORD-02 | — | Pending |
| CORD-03 | — | Pending |
| HOOK-01 | — | Pending |
| HOOK-02 | — | Pending |
| HOOK-03 | — | Pending |

**Coverage:**
- v2 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️ (pending roadmap creation)

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after initial definition*
