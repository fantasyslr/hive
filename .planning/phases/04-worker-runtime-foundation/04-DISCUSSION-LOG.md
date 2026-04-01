# Phase 4: Worker Runtime Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 04-worker-runtime-foundation
**Areas discussed:** Adapter interface design, Tool registry scope, Result structure, Migration strategy

---

## Adapter Interface Design

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal viable | `execute(prompt, env) → {result, error}`. Capability = name + model only | |
| Medium thickness | + capability profile + structured result. Enough for smart routing | ✓ |
| CC-level | Full session lifecycle: startSession/runTask/resumeSession/cancelTask | |

**User's choice:** Medium thickness
**Notes:** Has capability profile but no session lifecycle. Session methods deferred to Phase 6 (Coordinator + Session Mode).

---

## Tool Registry Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway API only | Register only Hive HTTP API tools. Harness internal tools unmanaged | |
| Two layers | Gateway API + harness capability declarations. Dispatcher uses both | ✓ |

**User's choice:** Two layers
**Notes:** Adapter declares harness tools (file.read, bash, web.search etc). Dispatcher can use this for smarter routing (code tasks → agents with bash).

---

## Result Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Worker self-fills | Prompt requests JSON output. Parse stdout as JSON | |
| Gateway LLM extraction | Worker returns raw text, gateway uses Haiku side query | |
| Combined | Try worker JSON first, fallback to gateway LLM extraction | ✓ |

**User's choice:** Combined (two-pass)
**Notes:** Worker prompt requests JSON → bridge tries JSON.parse → if fails, gateway side query with Haiku extracts structure. Failure never blocks task completion.

---

## Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One-step | Delete adapter.sh, rewrite bridge.ts. No fallback | ✓ |
| Gradual | Keep adapter.sh as fallback, build TS adapter alongside, remove later | |

**User's choice:** One-step
**Notes:** Clean cut, no fallback. New code in packages/hive-worker/.

---

## Claude's Discretion

- Package structure of packages/hive-worker/
- Prompt template format for structured JSON output
- Error handling for adapter failures
- Test strategy

## Deferred Ideas

- Per-taskKind tool allowlists → Phase 7 or v3.0
- Session lifecycle methods → Phase 6
- Context compaction → future
- Worker permission model → v3.0
- Streaming results → future
- Telemetry collection → future
