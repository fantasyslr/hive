# Requirements — Hive v1 Backend Enhancement

## v1 Requirements

### Memory Enhancement
- [x] **MEM-01**: Memory entries include source metadata (agent_id, task_id, created_by)
- [x] **MEM-02**: Namespace is an independent field on memory entries, not a title prefix convention
- [x] **MEM-03**: Duplicate detection on write — same namespace + similar content → update instead of insert
- [x] **MEM-04**: Memory entries support TTL with configurable expiration
- [x] **MEM-05**: Memory search supports filtering by namespace, agent_id, and time range

### User Authentication
- [x] **AUTH-01**: Simple role-based user login (4 fixed users: 投放, 运营, 素材, 主管)
- [x] **AUTH-02**: API endpoints require auth token (Bearer token, no session)
- [x] **AUTH-03**: Board and task visibility scoped by role (主管 sees all, others see own + shared)

### Task Templates
- [x] **TMPL-01**: Campaign template creates parent task + role-specific sub-tasks automatically
- [x] **TMPL-02**: Sub-tasks have dependency ordering (e.g., 调研 before 投放方案)
- [x] **TMPL-03**: Templates stored as JSON config, hot-reloadable like orchestrator prompt

### API Consistency
- [x] **API-01**: Unify all API field names to camelCase (fix snake_case fields: verification_required, retry_count, etc.)

## v2 Requirements (Deferred)

- Full-text search on memory — O(n) scan is fine for ~1000 entries at MVP scale
- OAuth / SSO — 4 fixed users, hardcoded credentials sufficient for internal tool
- Template editor UI — JSON config manually edited for now
- Memory garbage collection — TTL marks as expired but no auto-delete yet
- Budget/cost tracking — requires LLM provider usage APIs that don't exist yet
- Predictive analytics — basic historical stats first, ML later

## Out of Scope

- Multi-tenant / SaaS — single team, internal tool
- Mobile app — web only
- Virse integration — no public API
- Complex RBAC — 4 users, role field is enough

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| API-01 | Phase 1 | Complete |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| MEM-01 | Phase 2 | Complete |
| MEM-02 | Phase 2 | Complete |
| MEM-03 | Phase 2 | Complete |
| MEM-04 | Phase 2 | Complete |
| MEM-05 | Phase 2 | Complete |
| TMPL-01 | Phase 3 | Complete |
| TMPL-02 | Phase 3 | Complete |
| TMPL-03 | Phase 3 | Complete |
