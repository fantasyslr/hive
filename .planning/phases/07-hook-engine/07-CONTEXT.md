# Phase 7: Hook Engine - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a declarative hook engine to Hive's gateway. Hooks are defined in a JSON config file as `{on: event, if: condition, action: handler}`. The engine evaluates conditions and dispatches actions (HTTP webhooks, task creation, memory search) without code changes. Hot-reload on config file edit. Existing hardcoded behaviors (VerifyLoop, DependencyUnblocker, CoordinatorService) continue alongside.

</domain>

<decisions>
## Implementation Decisions

### Hook Config Schema & Engine
- **D-01:** `hooks.json` in project root: `{hooks: [{on, if, action}]}` — `on` is an EventBus event name (e.g. `task.completed`), `if` is optional condition, `action` is `{type, params}`.
- **D-02:** Condition evaluation uses simple field-match: `{"field": "task.taskKind", "eq": "execute"}`. No `eval()`, safe, covers 90% of use cases. Supports `eq`, `neq`, `in`, `exists` operators.
- **D-03:** `HookEngine` is a gateway service with `registerHooks(bus)` — subscribes to EventBus events, evaluates conditions, dispatches actions. Same service pattern as VerifyLoop/CoordinatorService.
- **D-04:** Zod schema validates hooks.json on load — invalid config is rejected with clear error, previous valid config stays active.

### Action Handlers
- **D-05:** Registry of action handlers: `{http: HttpAction, create_task: CreateTaskAction, memory_search: MemorySearchAction}` — each implements `ActionHandler.execute(event, params): Promise<void>`.
- **D-06:** HTTP action: `fetch(url, {method: 'POST', body: JSON.stringify(event.data)})` — simple webhook POST with event data payload. Timeout 5s, log failure, never block event processing.
- **D-07:** create_task action: uses `TaskMachine.create()` with params from config — `{type: "create_task", params: {title, taskKind, description}}`. Supports template variables like `${task.id}`, `${task.title}` resolved from event data.
- **D-08:** memory_search action: uses `MemoryService.search()` with query from config params — results logged or attached to task contextRef.

### Hot-Reload & Migration
- **D-09:** `fs.watch()` on hooks.json with 500ms debounce — re-parse and re-register on file change. Zod validation before applying; invalid edits are rejected with log warning.
- **D-10:** HookEngine runs alongside existing hardcoded hooks (VerifyLoop, DependencyUnblocker, CoordinatorService) — declarative hooks are additive. No migration of existing behaviors in v2.0. Both fire on the same EventBus events.

### Claude's Discretion
- Template variable resolution implementation (regex replace vs. structured interpolation)
- Default hooks.json shipped with the project (example hooks for common patterns)
- Error handling for action execution failures (log only vs. dead letter queue)
- Test strategy for hook engine (unit tests for condition eval, integration for action dispatch)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EventBus` — central event system, all hooks subscribe here
- `TaskMachine.create()` — for create_task action
- `MemoryService.search()` — for memory_search action
- Service registration pattern in `index.ts` — VerifyLoop, DependencyUnblocker, CoordinatorService all follow same `new Service(deps).registerHooks()` pattern

### Established Patterns
- Event-driven hooks via `EventBus.on(eventType, handler)`
- Fire-and-forget async handlers with `.catch()` error logging
- Zod schema validation for API inputs — reuse for config validation
- Constructor injection of TaskMachine, MemoryService, EventBus

### Integration Points
- `EventBus` events: task.completed, task.failed, task.assigned, task.updated, memory.updated
- Gateway `index.ts` — where HookEngine gets instantiated and wired
- `hooks.json` — new config file in project root
- `fs.watch()` — Node.js built-in for file watching

</code_context>

<specifics>
## Specific Ideas

- HookEngine follows exact same service pattern as CoordinatorService: constructor(deps), registerHooks(), internal event handlers.
- Condition evaluation is a pure function `evaluateCondition(condition, eventData): boolean` — easy to unit test.
- Template variable resolution: `${task.id}` → `event.data.taskId` via regex + dot-path traversal on event data.
- Ship a default `hooks.json` with one example hook commented out or as documentation.

</specifics>

<deferred>
## Deferred Ideas

- Migration of VerifyLoop/DependencyUnblocker to declarative hooks — v3.0
- Hook priority/ordering — future enhancement if needed
- Complex condition logic (AND/OR combinators) — add when field-match isn't enough
- Hook execution history/audit log — future observability
- Visual hook editor in UI — future frontend phase

</deferred>

---

*Phase: 07-hook-engine*
*Context gathered: 2026-04-01 via smart discuss (autonomous)*
