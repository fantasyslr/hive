---
phase: 04-worker-runtime-foundation
plan: 02
subsystem: hive-worker
tags: [adapters, cli-harness, structured-output, extraction]
dependency_graph:
  requires: [04-01]
  provides: [ClaudeAdapter, GeminiAdapter, CodexAdapter, extractStructuredResult]
  affects: [05-SMEM]
tech_stack:
  added: []
  patterns: [adapter-pattern, spawn-cli, two-pass-extraction, tdd]
key_files:
  created:
    - packages/hive-worker/src/extract-result.ts
    - packages/hive-worker/src/extract-result.test.ts
    - packages/hive-worker/src/adapters/claude-adapter.ts
    - packages/hive-worker/src/adapters/gemini-adapter.ts
    - packages/hive-worker/src/adapters/codex-adapter.ts
    - packages/hive-worker/src/adapters/index.ts
    - packages/hive-worker/src/adapters/claude-adapter.test.ts
  modified:
    - packages/hive-worker/src/index.ts
decisions:
  - "Each adapter spawns CLI as child process with stdin pipe — matches existing worker-adapter.sh pattern"
  - "extractStructuredResult is standalone utility — Phase 5 SMEM will import it for LLM extraction pass"
metrics:
  duration: 176s
  completed: "2026-04-01T03:37:46Z"
---

# Phase 04 Plan 02: Harness Adapters & Structured Result Extraction Summary

Three CLI harness adapters (Claude, Gemini, Codex) implementing HarnessAdapter interface with distinct capability profiles, plus reusable two-pass extractStructuredResult() utility that parses JSON or markdown-fenced JSON with raw text fallback.

## What Was Done

### Task 1: extractStructuredResult() utility (TDD)
- **RED:** 5 test cases covering valid JSON, missing conclusion, plain text, empty string, markdown fence
- **GREEN:** Two-pass extraction — tries JSON.parse on raw or fence-extracted content, falls back to rawFallback
- All 5 tests pass
- **Commit:** e4185b9

### Task 2: Three harness adapters + barrel exports
- **ClaudeAdapter:** structured output, persistent session, streaming, 200K ctx, 4 tools (file.read, file.write, bash, web.search)
- **GeminiAdapter:** structured output, no persistent session, streaming, 1M ctx, 1 tool (web.search)
- **CodexAdapter:** no structured output, no persistent session, no streaming, 200K ctx, 3 tools (bash, file.read, file.write)
- Each spawns its CLI (`claude -p -`, `gemini -p -`, `codex exec -`) and extracts results via extractStructuredResult
- Unit tests for ClaudeAdapter: spawn verification, JSON parsing, cancel/SIGTERM, error handling
- Barrel export from adapters/index.ts; package index.ts updated
- **Commit:** d67d0a1

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `npx vitest run packages/hive-worker/src/` — 18 tests pass across 3 files
- `grep "implements HarnessAdapter"` — 3 matches (claude, gemini, codex)
- Each adapter declares unique capability profile (codex.supportsStructuredOutput = false)

## Known Stubs

None — all adapters are fully wired to extractStructuredResult and spawn real CLI processes.

## Self-Check: PASSED

- All 7 created files: FOUND
- Commit e4185b9: FOUND
- Commit d67d0a1: FOUND
