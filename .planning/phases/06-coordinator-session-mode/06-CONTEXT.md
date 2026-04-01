# Phase 6: Coordinator + Session Mode - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add task decomposition and result synthesis to Hive's task system, plus persistent worker sessions. A "coordinate" task is decomposed into a sub-task DAG by a gateway service using LLM side query. When all sub-tasks complete, a "synthesize" task auto-aggregates results. Workers can optionally maintain context across consecutive tasks in the same runId.

</domain>

<decisions>
## Implementation Decisions

### Task Decomposition
- **D-01:** Gateway `CoordinatorService` handles decomposition — receives a coordinate task, uses Haiku side query to decompose goal into sub-tasks with dependency graph. Same side query pattern as Phase 5 extraction.
- **D-02:** Decomposition triggers on `task.assigned` when `taskKind=coordinate` — coordinator claims the task, decomposes, creates sub-tasks via batch API, marks coordinate task as "working" until synthesis completes.
- **D-03:** LLM returns JSON array: `[{title, description, taskKind, dependsOn: [titles]}]` — titles resolved to task IDs after batch creation. Validated with Zod schema.
- **D-04:** Add `coordinate` and `synthesize` to `TaskKind` union in `@hive/shared`.

### Batch Creation & Synthesis
- **D-05:** `POST /tasks/batch` with body `{parentTaskId, tasks: [{title, description, taskKind, dependsOn}]}` — single atomic creation, deps resolved within batch by title reference.
- **D-06:** Synthesis triggers via `DependencyUnblocker` pattern — listen for `task.completed`, check if all siblings of a coordinate parent are done, auto-create synthesize task with all sub-task results in contextRef.
- **D-07:** Synthesize task's contextRef contains aggregated sub-task results — synthesize agent reads all results and produces a summary. Parent coordinate task gets the synthesis result when synthesize task completes.

### Session Persistence
- **D-08:** Extend `HarnessAdapter` interface with optional `startSession(runId): Promise<void>` and `resumeSession(runId): Promise<void>` — adapter maintains a running process, consecutive tasks send to same process.
- **D-09:** Persistent mode is opt-in via `persistentSession: true` on task creation, or auto-enabled when taskKind=coordinate. One-shot mode remains default per CORD-04/05.
- **D-10:** Session timeout/crash → adapter detects dead process → falls back to one-shot for that task. Graceful degradation with warning log.

### Claude's Discretion
- LLM prompt template for task decomposition (how to instruct Haiku to produce sub-task DAGs)
- Batch creation transaction semantics (all-or-nothing vs. partial creation)
- Synthesize task prompt template (how to aggregate sub-task results)
- Session keepalive/heartbeat mechanism (if needed)
- Test fixtures for coordinator and session flows

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TaskKind` type union in `@hive/shared` — extend with `coordinate`/`synthesize`
- `TaskMachine.create()` — already accepts `dependsOn`, `parentTaskId`, `runId`
- `DependencyUnblocker` — existing pattern for watching task.completed and unblocking dependents. Extend for synthesis trigger.
- `VerifyLoop` — uses `runId` for linking task chains, same pattern for coordinator chains
- `HarnessAdapter` interface in `@hive/worker` — extend with session methods
- `extractWithLLM()` / `LlmClient` — reuse for decomposition side query

### Established Patterns
- Event-driven hooks via `EventBus` — task.completed/task.assigned events
- Fire-and-forget async in hooks
- Side query pattern from Phase 5 (lightweight LLM call)
- `runId` propagation through task chains (VerifyLoop)

### Integration Points
- `Dispatcher.autoAssign()` — coordinate tasks need special handling (route to coordinator, not regular agent)
- `POST /tasks` route — add batch variant
- `DependencyUnblocker.onTaskCompleted()` — extend with synthesis check
- Worker bridge — session management for persistent mode

</code_context>

<specifics>
## Specific Ideas

- CoordinatorService is a gateway service, not a worker — it runs inside the gateway process, similar to VerifyLoop.
- Batch creation resolves `dependsOn` titles to IDs within the same batch — no need for sequential creation.
- Synthesize task auto-creation mirrors VerifyLoop's auto-fix pattern — event-driven, not polling.
- Session persistence deferred in Phase 4 D-02 is now implemented — startSession/resumeSession added to HarnessAdapter.

</specifics>

<deferred>
## Deferred Ideas

- Context compaction for long sessions — future enhancement
- Multi-level decomposition (coordinate within coordinate) — v3.0
- Worker permission model for coordinator actions — v3.0
- Visual DAG editor in UI — future frontend phase

</deferred>

---

*Phase: 06-coordinator-session-mode*
*Context gathered: 2026-04-01 via smart discuss (autonomous)*
