# Roadmap: Hive v1 Backend Enhancement

## Overview

Hive v0 is a working multi-agent gateway. v1 backend work has three goals: (1) stabilize the API surface for frontend consumption, (2) upgrade shared memory into a reliable knowledge layer with source tracking, dedup, and TTL, and (3) add campaign templates so the team can launch structured workflows. API cleanup and auth go first since they affect every endpoint; memory enhancement is the core value delivery; templates build on top of both.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: API Stabilization & Auth** - Unify field naming to camelCase and add Bearer token auth for 4 fixed users
- [ ] **Phase 2: Memory Enhancement** - Source tracking, namespace refactor, dedup, TTL, and advanced filtering
- [ ] **Phase 3: Campaign Templates** - Template-driven task creation with role-specific sub-tasks and dependency ordering

## Phase Details

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
- [ ] 01-03-PLAN.md — Add role-based task visibility scoping to GET /tasks and GET /board (AUTH-03)

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
- [ ] 02-01-PLAN.md — Extend SQLite store with namespace column, agentId/taskId source tracking, TTL expiration, content dedup, and filtered search
- [ ] 02-02-PLAN.md — Wire new store features through MCP server tools, shared schemas, Gateway MemoryService, and search route

### Phase 3: Campaign Templates
**Goal**: A manager can launch a structured campaign that automatically creates role-specific sub-tasks with the right ordering
**Depends on**: Phase 2 (campaign outputs should write to memory with proper source tracking)
**Requirements**: TMPL-01, TMPL-02, TMPL-03
**Success Criteria** (what must be TRUE):
  1. Creating a task from the "Campaign" template produces a parent task and one sub-task per role (投放, 运营, 素材) with correct assignments
  2. Sub-tasks have dependency ordering enforced -- a dependent sub-task cannot be claimed until its predecessor is done
  3. Templates are stored as JSON config files and can be modified without restarting the server
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. API Stabilization & Auth | 2/3 | In progress | - |
| 2. Memory Enhancement | 0/2 | Planning done | - |
| 3. Campaign Templates | 0/? | Not started | - |
