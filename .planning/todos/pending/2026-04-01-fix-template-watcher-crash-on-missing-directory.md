---
created: 2026-04-01T09:21:51.334Z
title: Fix template watcher crash on missing directory
area: general
files:
  - packages/hive-gw/src/services/template-loader.ts:47-58
  - packages/hive-gw/src/index.ts:158-172
---

## Problem

`startTemplateWatcher()` resolves `templatePath` via `join(process.cwd(), 'templates')` but the repo-root `templates/` directory is untracked. On a clean checkout or deployment, `fs.watch()` throws `ENOENT` and crashes the gateway before it can listen.

The only tracked template lives under `packages/hive-gw/templates/`, not the repo root. The watcher logs directory-read failures but still unconditionally calls `watch(dirPath)`.

Source: Codex adversarial review (2026-04-01).

## Solution

Either:
1. Fail closed before calling `watch()` when the directory is absent (skip watcher gracefully), OR
2. Resolve `templatePath` to the tracked `packages/hive-gw/templates/` location and ensure it exists in source control.

Add a startup integration test that boots from a clean checkout and asserts template loading does not crash when templates are absent or malformed.
