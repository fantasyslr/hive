---
phase: 05-structured-memory-history-injection
verified: 2026-04-01T05:54:18Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 05: Structured Memory + History Injection Verification Report

**Phase Goal:** Every completed task produces structured knowledge that future tasks automatically receive as context — the team genuinely never starts from scratch
**Verified:** 2026-04-01T05:54:18Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | extractWithLLM() calls Haiku to extract structured fields from raw text | VERIFIED | `packages/hive-worker/src/llm-client.ts` lines 21-43: two-pass extraction, LLM called when local parse yields rawFallback |
| 2 | extractWithLLM() failure returns rawFallback — never throws | VERIFIED | catch block at line 39-41 returns `{ conclusion: raw, decisionReason: '', keyFindings: [], artifacts: [], reusableFor: [], raw }` |
| 3 | MemoryConclusion has reusableFor and keyFindings fields | VERIFIED | `packages/shared/src/types.ts` lines 93-94: both fields present with `string[]` type |
| 4 | HistoryContext type exists for history injection payload | VERIFIED | `packages/shared/src/types.ts` lines 97-103: exported interface with taskId, conclusion, decisionReason, reusableFor, similarity |
| 5 | Task completion triggers LLM extraction of structured conclusion fields | VERIFIED | `memory-service.ts` lines 86-93: `writeConclusion` calls `extractWithLLM` when `llmClient` and `task.result` present; `registerHooks` binds to `task.completed` event (line 199) |
| 6 | Extraction failure logs error and stores rawFallback — never blocks task flow | VERIFIED | `memory-service.ts` lines 89-92: catch logs warn, falls through to store raw fallback; fire-and-forget in registerHooks (line 204) |
| 7 | Stored conclusion contains reusableFor tags searchable via memory_search | VERIFIED | `memory-service.ts` line 115: `tags: conclusion.reusableFor` passed to `callTool` |
| 8 | Before task assignment, system searches memory for top-3 related conclusions | VERIFIED | `history-injector.ts` lines 31-35: searches with `limit: CANDIDATE_POOL (10)`, returns top-3 |
| 9 | Matched conclusions are injected into task contextRef as HistoryContext[] | VERIFIED | `dispatcher.ts` lines 132-135: `taskMachine.updateContextRef(task.id, history)` called when `history.length > 0`; `task-machine.ts` line 172-178: `updateContextRef` sets `task.contextRef` |
| 10 | When cosine scores are low, LLM fallback re-ranks candidates | VERIFIED | `history-injector.ts` lines 54-61: `hasLowScores` check triggers `rerankWithLLM`; LLM failure falls back to vector scores (line 107-108) |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/hive-worker/src/llm-client.ts` | extractWithLLM function and LlmClient interface | VERIFIED | 68 lines; exports `LlmClient`, `extractWithLLM`, `createHaikuClient` |
| `packages/shared/src/types.ts` | Extended MemoryConclusion + HistoryContext type | VERIFIED | Both `reusableFor: string[]` and `keyFindings: string[]` on MemoryConclusion; `HistoryContext` interface exported; `Task.contextRef` is `string \| HistoryContext[]` |
| `packages/hive-worker/src/extract-result.test.ts` | Tests for LLM extraction path | VERIFIED | 5 tests in `extractWithLLM` describe block covering: local success, LLM call on rawFallback, LLM failure fallback, non-JSON LLM response, raw field preservation |
| `packages/hive-gw/src/services/memory-service.ts` | writeConclusion with LLM extraction pass | VERIFIED | 243 lines; `extractWithLLM` imported and called; `LlmClient` optional 4th constructor param |
| `packages/hive-gw/src/services/memory-service.test.ts` | Tests for LLM-enhanced writeConclusion | VERIFIED | 5 new tests in `writeConclusion with LLM extraction` describe block; `failingLlmClient` covers D-03; tags from reusableFor verified |
| `packages/hive-gw/src/services/history-injector.ts` | HistoryInjector class with search + LLM fallback | VERIFIED | 112 lines; `HistoryInjector` class exported; `COSINE_THRESHOLD = 0.3`; `rerankWithLLM` private method |
| `packages/hive-gw/src/services/history-injector.test.ts` | Tests for injection and dual-channel retrieval | VERIFIED | 7 tests covering: score threshold, LLM re-ranking trigger, fallback, empty results, error safety, JSON parsing, vector-only mode |
| `packages/hive-gw/src/services/dispatcher.ts` | autoAssign with history injection before claim | VERIFIED | `HistoryInjector` imported; `injector.inject(task)` called fire-and-forget in `autoAssign`; backward-compatible optional 3rd param |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `llm-client.ts` | `./types.js` | imports StructuredResult | VERIFIED | Line 1: `import type { StructuredResult } from './types.js'` |
| `hive-worker/src/index.ts` | `./llm-client.js` | barrel re-export | VERIFIED | Lines 5-6: `export { extractWithLLM, createHaikuClient }` and `export type { LlmClient }` |
| `memory-service.ts` | `@hive/worker` | imports extractWithLLM and LlmClient | VERIFIED | Lines 3-4: `import { extractWithLLM }` and `import type { LlmClient, StructuredResult }` |
| `memory-service.ts` | memory MCP backend | callTool with structured JSON content | VERIFIED | Line 109-116: `callTool(this.toolNames.add, { ..., tags: conclusion.reusableFor })` |
| `history-injector.ts` | `memory-service.ts` | MemoryService.search() for vector retrieval | VERIFIED | Lines 32-35: `this.memoryService.search(query, { namespace: 'public', limit: CANDIDATE_POOL })` |
| `dispatcher.ts` | `history-injector.ts` | injector.inject(task) before claim | VERIFIED | Lines 128-139: `this.injector.inject(task).then(...)` before `taskMachine.claim` |
| `history-injector.ts` | `@hive/shared` | HistoryContext type for contextRef | VERIFIED | Line 1: `import type { Task, HistoryContext, MemoryConclusion } from '@hive/shared'` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `memory-service.ts` writeConclusion | `extracted` (StructuredResult) | `extractWithLLM(task.result, this.llmClient)` → LLM API or local JSON parse | Yes — real task result flows in, structured fields stored with tags | FLOWING |
| `history-injector.ts` inject() | `results` (SearchHit[]) | `memoryService.search(query, ...)` → memory MCP backend | Yes — real search query built from task.title + task.description | FLOWING |
| `dispatcher.ts` autoAssign | `history` (HistoryContext[]) | `injector.inject(task)` → memory search | Yes — injected via `taskMachine.updateContextRef(task.id, history)` on the stored task | FLOWING |

**Note on fire-and-forget:** `autoAssign` fires injection asynchronously. The `claim()` call returns before `updateContextRef` runs. This is an intentional design per D-08/D-11 — the agent receives updated `contextRef` when it polls the task, not at the moment of `autoAssign` return. This is not a data-flow gap; it is an acknowledged async pattern.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All phase 05 tests pass | `npx vitest run` on 4 test files | 185 passed (18 files), 0 failures | PASS |
| HistoryContext type exported from @hive/shared | grep in types.ts | `export interface HistoryContext` at line 97 | PASS |
| LlmClient defined locally in history-injector.ts (not @hive/worker) | grep pattern | Minimal interface at line 6-8, deviation from plan intentional — @hive/worker not a hive-gw dependency | PASS |
| updateContextRef exists on TaskMachine | grep in task-machine.ts | Line 172: method present, sets contextRef and updatedAt | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SMEM-01 | 05-01, 05-02 | Task completion triggers LLM extraction — failure never blocks | SATISFIED | `registerHooks` fires `writeConclusion` on `task.completed`; catch path stores rawFallback; fire-and-forget so task flow is never blocked |
| SMEM-02 | 05-01, 05-02 | Structured conclusions stored with all fields individually searchable | SATISFIED | `writeConclusion` stores `conclusion`, `decisionReason`, `keyFindings`, `reusableFor` in `MemoryConclusion` JSON; `tags: conclusion.reusableFor` passed to `memory_add` callTool |
| HINJ-01 | 05-03 | Before assignment, auto-search historical conclusions top-3 | SATISFIED | `autoAssign` calls `injector.inject(task)` which searches memory with `limit=10`, returns top-3 |
| HINJ-02 | 05-03 | Matched conclusions injected into task.contextRef | SATISFIED | `taskMachine.updateContextRef(task.id, history)` writes `HistoryContext[]` to task |
| HINJ-03 | 05-03 | Dual-channel retrieval — cosine fast path + LLM re-ranking | SATISFIED | `COSINE_THRESHOLD = 0.3`; `hasLowScores` triggers `rerankWithLLM`; LLM failure falls back to vector scores |

No orphaned requirements found. All 5 phase-5 requirement IDs (SMEM-01, SMEM-02, HINJ-01, HINJ-02, HINJ-03) are claimed by plans and verified in the codebase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

No TODO/FIXME/placeholder comments in any phase-05 file. No empty return stubs. No hardcoded empty data passed to rendering. SUMMARY notes "Known Stubs: None" for all three plans — verified correct.

**One intentional design note:** `LlmClient` is redefined locally in `history-injector.ts` (minimal interface `{ query(prompt: string): Promise<string> }`) rather than imported from `@hive/worker`. This deviates from the plan but is documented in 05-03-SUMMARY as a deliberate fix — `@hive/worker` is not a dependency of `hive-gw`. The interface is structurally identical, so no behavioral gap exists.

### Human Verification Required

None. All phase behaviors are verifiable programmatically. LLM calls use injectable `LlmClient` interface, so real Haiku API calls are not needed for test coverage — mocks cover all paths including failure.

### Gaps Summary

No gaps. All must-haves verified at all four levels (exists, substantive, wired, data-flowing).

---

_Verified: 2026-04-01T05:54:18Z_
_Verifier: Claude (gsd-verifier)_
