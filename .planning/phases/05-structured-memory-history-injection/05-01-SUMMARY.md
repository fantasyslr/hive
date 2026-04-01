---
phase: 05-structured-memory-history-injection
plan: 01
subsystem: memory
tags: [llm, anthropic, haiku, structured-extraction, history-injection, types]

requires:
  - phase: 04-worker-runtime-foundation
    provides: StructuredResult type, extractStructuredResult utility, hive-worker package
provides:
  - MemoryConclusion with reusableFor[] and keyFindings[] fields
  - HistoryContext type for injection payload
  - extractWithLLM() two-pass LLM extraction utility
  - LlmClient injectable interface
  - createHaikuClient() for production Anthropic API
affects: [05-02, 05-03, memory-service, task-dispatch]

tech-stack:
  added: [anthropic-api-direct-fetch]
  patterns: [injectable-llm-client, two-pass-extraction, graceful-fallback]

key-files:
  created:
    - packages/hive-worker/src/llm-client.ts
  modified:
    - packages/shared/src/types.ts
    - packages/hive-worker/src/extract-result.test.ts
    - packages/hive-worker/src/index.ts
    - packages/hive-gw/src/services/memory-service.ts

key-decisions:
  - "LlmClient is injectable interface for testability — no mocking fetch"
  - "extractWithLLM tries local JSON first, only calls LLM on rawFallback"
  - "Failure never blocks — rawFallback returned on any LLM error (per D-03)"

patterns-established:
  - "Injectable LlmClient: all LLM calls go through interface for test/swap"
  - "Two-pass extraction: local parse first, LLM second, raw fallback last"

requirements-completed: [SMEM-01, SMEM-02]

duration: 2min
completed: 2026-04-01
---

# Phase 05 Plan 01: Type Contracts + LLM Extraction Summary

**Extended MemoryConclusion with reusableFor/keyFindings, added HistoryContext type, implemented extractWithLLM two-pass extraction with Haiku client**

## Performance

- **Duration:** 158s (~2.5 min)
- **Started:** 2026-04-01T05:42:18Z
- **Completed:** 2026-04-01T05:44:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- MemoryConclusion extended with reusableFor[] and keyFindings[] for structured memory search
- HistoryContext type created for injection payload with similarity scoring
- Task.contextRef now accepts string | HistoryContext[] (backward compatible)
- extractWithLLM() implements two-pass extraction: local JSON parse then LLM fallback
- 5 new tests covering LLM extraction paths, all passing (10 total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types -- MemoryConclusion fields + HistoryContext** - `12c985f` (feat)
2. **Task 2: Create extractWithLLM utility + LlmClient interface** - `cdf4002` (feat)

## Files Created/Modified
- `packages/shared/src/types.ts` - Extended MemoryConclusion, added HistoryContext, updated Task.contextRef
- `packages/hive-worker/src/llm-client.ts` - New: extractWithLLM, LlmClient interface, createHaikuClient
- `packages/hive-worker/src/extract-result.test.ts` - 5 new tests for LLM extraction path
- `packages/hive-worker/src/index.ts` - Barrel exports for llm-client
- `packages/hive-gw/src/services/memory-service.ts` - Added empty defaults for new required fields

## Decisions Made
- LlmClient as injectable interface rather than mocking fetch -- cleaner tests, swappable providers
- extractWithLLM tries local JSON extraction first to avoid unnecessary LLM calls
- Per D-03: extraction failure never throws, always returns rawFallback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added reusableFor/keyFindings defaults in memory-service.ts**
- **Found during:** Task 1 (type extension)
- **Issue:** memory-service.ts constructs MemoryConclusion without the new required fields, would fail tsc
- **Fix:** Added `reusableFor: []` and `keyFindings: []` defaults in writeConclusion
- **Files modified:** packages/hive-gw/src/services/memory-service.ts
- **Verification:** tsc --noEmit passes for shared package
- **Committed in:** 12c985f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain compilation. No scope creep.

## Issues Encountered
- Pre-existing tsc errors in hive-gw (feishu event_type naming, templates route) -- not caused by this plan, not fixed

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all code paths are functional. createHaikuClient requires ANTHROPIC_API_KEY at runtime but is not a stub.

## Next Phase Readiness
- Types and extraction utility ready for 05-02 (memory write enrichment)
- extractWithLLM can be called from memory-service after task completion
- HistoryContext ready for 05-03 (history injection into task dispatch)

---
*Phase: 05-structured-memory-history-injection*
*Completed: 2026-04-01*
