---
created: 2026-04-01T09:21:51.334Z
title: Harden template launch DAG validation
area: general
files:
  - packages/hive-gw/src/routes/templates.ts:107-119
---

## Problem

`launchTemplate()` resolves `dependsOn` in a single pass against tasks already seen, then silently filters out any misses. A misspelled title, duplicate title collision, or forward reference to a later-declared task is silently converted into `[]`, making the task runnable immediately — out of order.

The batch task API (`/tasks/batch`) already treats unknown dependency titles as a 400 with rollback. Templates are less safe and can execute review/strategy steps before prerequisites exist, producing bad outputs with no operator-visible error.

Source: Codex adversarial review (2026-04-01).

## Solution

1. Validate the full template DAG before creating any tasks
2. Reject unknown or duplicate titles
3. Resolve dependencies in a second pass so declaration order does not matter
4. Fail the launch instead of dropping missing edges
5. Achieve parity with `/tasks/batch` rollback behavior
