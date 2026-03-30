---
phase: 01-api-stabilization-auth
plan: 01
subsystem: shared-types, hive-gw
tags: [rename, camelCase, api-consistency]
dependency_graph:
  requires: []
  provides: [camelCase-api-fields]
  affects: [hive-gw-routes, hive-gw-services, shared-types]
tech_stack:
  added: []
  patterns: [camelCase-field-naming]
key_files:
  created: []
  modified:
    - packages/shared/src/types.ts
    - packages/shared/src/schemas.ts
    - packages/hive-gw/src/services/task-machine.ts
    - packages/hive-gw/src/services/registry.ts
    - packages/hive-gw/src/services/dispatcher.ts
    - packages/hive-gw/src/services/p2p-proxy.ts
    - packages/hive-gw/src/services/verify-loop.ts
    - packages/hive-gw/src/services/memory-service.ts
    - packages/hive-gw/src/routes/tasks.ts
    - packages/hive-gw/src/routes/agents.ts
    - packages/hive-gw/src/routes/events.ts
    - packages/hive-gw/src/routes/heartbeat.ts
    - packages/hive-gw/src/routes/task-fields.test.ts
    - packages/hive-gw/src/routes/task-orchestration.test.ts
    - packages/hive-gw/src/routes/review-fixes.test.ts
    - packages/hive-gw/src/routes/events.test.ts
    - packages/hive-gw/src/services/dispatcher.test.ts
    - packages/hive-gw/src/services/p2p-proxy.test.ts
    - packages/hive-gw/src/services/registry.test.ts
    - packages/hive-gw/src/services/task-machine.test.ts
    - packages/hive-gw/src/services/verify-loop.test.ts
decisions:
  - "Express route URL params (req.params.agent_id) kept as-is since they match URL path convention (:agent_id)"
  - "hive-ui and feishu-mcp snake_case fields left untouched (out of plan scope)"
metrics:
  duration: 225s
  completed: 2026-03-30
---

# Phase 01 Plan 01: camelCase API Field Rename Summary

Mechanical rename of all snake_case API field names to camelCase across shared types, Zod schemas, gateway services, routes, and tests.

## One-liner

Pure mechanical snake_case-to-camelCase rename across 21 files (types, schemas, services, routes, tests) with zero behavior changes.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Rename snake_case fields in shared types and schemas | aa21454 | Done |
| 2 | Propagate camelCase renames to all services, routes, and tests | 8bd6308 | Done |

## What Changed

### Task 1: Shared types and schemas (committed prior to this execution)
- **types.ts**: Renamed 20+ fields across Task, AgentCard, MemoryConclusion, RoutingScore, P2PRequest, P2PResponse, FeishuChangeEvent interfaces
- **schemas.ts**: Renamed all Zod schema keys to match (AgentRegistrationSchema, CreateTaskSchema, ClaimTaskSchema, UpdateTaskSchema, PublishEventSchema, P2PRequestSchema)

### Task 2: Services, routes, and tests
- **Services** (6 files): task-machine.ts, registry.ts, dispatcher.ts, p2p-proxy.ts, verify-loop.ts, memory-service.ts
- **Routes** (5 files): tasks.ts, agents.ts, events.ts, heartbeat.ts
- **Tests** (10 files): All test files updated to use camelCase field names in assertions and setup data

### Key renames applied
- `agent_id` -> `agentId`
- `from_agent_id` -> `fromAgentId`
- `to_agent_id` -> `toAgentId`
- `task_id` -> `taskId`
- `output_refs` -> `outputRefs`
- `context_ref` -> `contextRef`
- `task_kind` -> `taskKind`
- `parent_task_id` -> `parentTaskId`
- `run_id` -> `runId`
- `verification_required` -> `verificationRequired`
- `retry_count` -> `retryCount`
- `timeout_ms` -> `timeoutMs`
- `latency_ms` -> `latencyMs`
- `event_type` -> `eventType`
- `app_token` -> `appToken`
- `table_id` -> `tableId`
- `document_id` -> `documentId`
- `operator_id` -> `operatorId`
- `decision_reason` -> `decisionReason`
- `impact_scope` -> `impactScope`

## Deviations from Plan

### Note: Partial prior execution
Task 1 was committed in a previous execution attempt (commit aa21454). Task 2's service/route changes were partially applied to the working tree but not committed. This execution verified correctness, fixed remaining test file references (task-machine.test.ts output_refs, verify-loop.test.ts full rename), and committed the complete Task 2.

### Out-of-scope snake_case references identified
- `packages/hive-ui/src/lib/types.ts` — has snake_case fields (separate frontend package, not in plan scope)
- `packages/feishu-mcp/src/webhook-receiver.ts` — has snake_case fields (matches external Feishu API, not in plan scope)
- `req.params.agent_id` in agents.ts routes — kept as-is per plan instructions (URL path convention)

## Verification

- `npx vitest run --exclude '.claude/worktrees/**'` — 19 test files, 79 tests, all pass
- Zero snake_case field names in types.ts and schemas.ts
- Zero snake_case field references in hive-gw services/routes (except URL path params)

## Known Stubs

None — this was a pure rename with no new functionality.

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit aa21454 (Task 1): FOUND
- Commit 8bd6308 (Task 2): FOUND
