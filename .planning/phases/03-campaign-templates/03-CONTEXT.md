# Phase 3: Campaign Templates - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

A manager can launch a structured campaign that automatically creates role-specific sub-tasks with the right ordering. Templates stored as JSON config, hot-reloadable.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key context from prior phases:
- Phase 1: Auth middleware active, 4 users (ad_buyer/operations/creative/manager), req.user available
- Phase 2: Memory now has namespace, source tracking (agentId/taskId), TTL, dedup, filtered search
- Task system: TaskMachine in task-machine.ts, tasks have parentTaskId field (from camelCase rename)
- Orchestrator prompt: hot-reloaded via fs.watch in prompt-loader.ts — same pattern for templates

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- packages/hive-gw/src/services/task-machine.ts — TaskMachine.create() accepts parentTaskId
- packages/hive-gw/src/routes/tasks.ts — POST /tasks creates tasks
- packages/hive-gw/src/services/dispatcher.ts — auto-assigns based on capabilities/interests
- packages/hive-gw/src/services/prompt-loader.ts — fs.watch hot-reload pattern to reuse
- packages/shared/src/types.ts — Task type with all camelCase fields

### Established Patterns
- Zod validation for all inputs
- Express routes delegate to service layer
- Config loaded from environment or files in config.ts

</code_context>

<specifics>
## Specific Ideas

Campaign template should create:
- Parent task: "Q3 Japan Campaign" (assigned to manager)
- Sub-task 1: Market Research (assigned to operations role, no dependency)
- Sub-task 2: Ad Strategy (assigned to ad_buyer role, depends on sub-task 1)
- Sub-task 3: Creative Assets (assigned to creative role, depends on sub-task 1)
- Sub-task 4: Manager Review (assigned to manager, depends on sub-tasks 2+3)

</specifics>

<deferred>
## Deferred Ideas

- Template editor UI — manually edit JSON for now
- Custom template creation by users — predefined templates only in v1

</deferred>
