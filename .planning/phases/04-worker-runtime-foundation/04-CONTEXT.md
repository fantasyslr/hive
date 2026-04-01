# Phase 4: Worker Runtime Foundation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade Hive's worker layer from a bash shell wrapper to a typed TypeScript runtime with capability-aware adapters, a two-layer tool registry, and structured task results. This is infrastructure — no new user-facing features, but every subsequent phase builds on it.

</domain>

<decisions>
## Implementation Decisions

### Adapter Interface Design
- **D-01:** Medium-thickness adapter interface. Each harness implements `HarnessAdapter` with: `name`, `model`, `capabilities: HarnessCapabilities`, `execute(task: TaskPayload): Promise<StructuredResult>`, and optional `cancel()`.
- **D-02:** `HarnessCapabilities` declares: `supportsStructuredOutput`, `supportsPersistentSession`, `supportsStreaming`, `maxContextTokens`. No session lifecycle methods in v2.0 Phase 4 — `startSession/resumeSession` deferred to Phase 6 (Coordinator + Session Mode).
- **D-03:** Three concrete adapters: `ClaudeAdapter`, `GeminiAdapter`, `CodexAdapter`. Each lives in a new `packages/hive-worker/` package.

### Tool Registry
- **D-04:** Two-layer tool registry: Hive tools (gateway HTTP API) + Harness tools (declared by each adapter).
- **D-05:** Hive tools are self-describing objects registered in gateway: `memory.search`, `memory.write`, `task.create`, `board.read`, `feishu.send`. Each declares `isReadOnly` and `isConcurrencySafe`.
- **D-06:** Harness tools are declared by the adapter at registration. Example: Claude declares `file.read`, `bash`, `web.search`; Codex declares `bash`, `file.read`, `file.write`. Dispatcher can use this for smarter routing (e.g., code tasks → agents with `bash` capability).
- **D-07:** No per-taskKind tool restriction in Phase 4 — tool gating is a future enhancement. All registered tools are visible to all workers for now.

### Structured Result
- **D-08:** `StructuredResult` schema: `{ conclusion: string, decisionReason: string, keyFindings: string[], artifacts: string[], raw: string }`. The `raw` field preserves original output.
- **D-09:** Two-pass extraction: worker prompt requests JSON output → bridge tries `JSON.parse()` → if valid and has `conclusion` field, use it. If parse fails, gateway calls side query (Haiku) to extract structure from raw text.
- **D-10:** Side query extraction failure never blocks task completion — falls back to `{ conclusion: raw, decisionReason: '', keyFindings: [], artifacts: [] }`.
- **D-11:** This same side query pipeline will be reused by Phase 5 (SMEM) for memory extraction — design it as a reusable `extractStructuredResult()` utility.

### Migration Strategy
- **D-12:** One-step migration. Delete `worker-adapter.sh`, rewrite `worker-bridge.ts` to import from `packages/hive-worker/`. No fallback to bash.
- **D-13:** `worker-bridge.ts` stays as a standalone script (not a gateway service) — it runs as a separate process that polls the gateway. But it imports the adapter package.
- **D-14:** Existing `AgentCard` in `@hive/shared` gets extended with `harnessCapabilities` and `harnessTools` fields (optional, backward-compatible).

### Claude's Discretion
- Internal package structure of `packages/hive-worker/` (file layout, exports)
- Prompt template format for requesting structured JSON output
- Error handling strategy for adapter failures (timeout, crash, malformed output)
- Test strategy (unit tests for adapters, integration tests for bridge)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Worker Code
- `scripts/worker-bridge.ts` — Current worker implementation (277 lines), poll + spawn + patch-back loop
- `scripts/worker-adapter.sh` — Current bash adapter (24 lines), to be replaced
- `scripts/start-worker-profile.sh` — Worker startup with env vars

### Shared Types
- `packages/shared/src/types.ts` — AgentCard, Task, TaskKind, RoutingScore definitions
- `packages/shared/src/schemas.ts` — Zod validation schemas

### Gateway Services
- `packages/hive-gw/src/services/registry.ts` — AgentRegistry (will need harnessCapabilities extension)
- `packages/hive-gw/src/services/dispatcher.ts` — Dispatcher scoring (will consume harness tool info)
- `packages/hive-gw/src/services/memory-service.ts` — MemoryService.writeConclusion (will consume StructuredResult)

### CC Source Analysis
- `~/discussions/2026-04-01-claude-code-source-analysis-for-hive.md` — Design patterns reference (Tool self-description, side query, capability model)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `worker-bridge.ts` core loop (register → heartbeat → poll → process) is solid — keep the structure, replace the execution layer
- `buildTaskEnv()` pattern for passing task context via env vars — extend for structured result expectations
- `requestApproval()` via P2P proxy — keep as-is, works for approval workflows
- Memory search before execution (lines 213-218) — keep, this becomes part of history injection in Phase 5

### Established Patterns
- Gateway HTTP API with Bearer token auth — worker already uses this
- `@hive/shared` for cross-package types — new `StructuredResult` type goes here
- Monorepo with `npm workspaces` — new `packages/hive-worker/` follows same pattern
- Vitest for testing — adapters get unit tests

### Integration Points
- `AgentCard` registration (`POST /agents`) — needs `harnessCapabilities` and `harnessTools` fields
- `patchTask()` result field — changes from raw string to JSON-serialized StructuredResult
- `MemoryService.writeConclusion()` — will consume structured conclusion instead of raw `task.result`
- `Dispatcher.scoreAgent()` — can optionally use `harnessTools` for smarter routing

</code_context>

<specifics>
## Specific Ideas

- CC's `isConcurrencySafe(input)` pattern — input-dependent, not static flag. Adopt for Hive tools.
- CC's `sideQuery()` — lightweight LLM call that skips full tool executor. Implement as utility for result extraction.
- Adapter capability profile informs dispatcher routing — agent with `bash` capability scores higher for code execution tasks.
- `StructuredResult.raw` always preserved — debugging and backward compatibility.

</specifics>

<deferred>
## Deferred Ideas

- Per-taskKind tool allowlists (D-07 noted as future) — revisit in Phase 7 (Hook Engine) or v3.0
- Session lifecycle methods (startSession/resumeSession) — Phase 6 (Coordinator + Session Mode)
- Context compaction for persistent sessions — Future requirement
- Worker permission model with approval gates per tool — v3.0
- Streaming result support — when harness adapter declares `supportsStreaming`
- Telemetry collection from worker sessions — future enhancement

</deferred>

---

*Phase: 04-worker-runtime-foundation*
*Context gathered: 2026-04-01*
