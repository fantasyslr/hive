# HANDOFF — Hive Multi-Agent Collaboration System

**Date:** 2026-03-29
**Branch:** master (clean, 37 commits)
**Repo:** ~/hive (npm workspace monorepo)

## Goal

- Build a multi-agent collaboration gateway for a 3-4 person cross-border e-commerce team (Moody lenses)
- Agents (Claude Code, Codex CLI, Gemini CLI) share memory, coordinate tasks, receive real-time events via SSE
- All 4 phases complete: Gateway Core → Memory Integration → Advanced Routing & P2P → Feishu Bridge
- Post-build: 2 rounds of code review fixes + design convergence (TDD) + OMC-inspired orchestration

## Architecture Decisions (Do Not Lose)

1. **Gateway is mostly a dumb broker** — the only built-in logic is VerifyLoop (auto verify/fix sub-tasks). All other orchestration is in the orchestrator prompt file, not in gateway code.
2. **Memory namespace isolation is convention-based** — Nowledge Mem has no ACL. Paths like `public/conclusions/*` and `agent/{id}/*` are soft constraints, not security boundaries. This is documented and intentional.
3. **Lark CLI (@larksuite/cli) is the recommended Feishu path** — 19 skill domains installed, auth configured. The built-in feishu-mcp (4 tools) is still in the codebase and Gateway still imports `@hive/feishu-mcp/webhook-receiver`. Lark CLI has NOT replaced feishu-mcp at the code level — it's a parallel capability.
4. **reject is a route action, not a task status** — `POST /tasks/:id/reject` transitions claimed→pending. TaskStatus type is still `pending | claimed | working | done | failed`. The design doc's `action + payload` protocol format has NOT been implemented in types/schemas.
5. **Transition guard allows null agentId for pending** — retry (failed→pending) passes null, which is exempted from the assignee ownership check. This is intentional, not a bug.
6. **SSE event types are split** — agents can only publish `task.updated`, `memory.updated`, `feishu.changed` via POST /events. Lifecycle events (task.completed, agent.online, etc.) are Gateway-only.

## Changed Files (Key)

### packages/shared/src/
| File | Why |
|------|-----|
| `types.ts` | Task has collaboration fields (from/to/context_ref/artifacts), orchestration fields (task_kind/parent_task_id/run_id/verification_required/retry_count), P2P types, BoardSnapshot |
| `schemas.ts` | CreateTaskSchema extended, PublishEventSchema (restricted whitelist), P2PRequestSchema |
| `constants.ts` | RESERVED_EVENT_TYPES, AGENT_PUBLISHABLE_EVENT_TYPES, ROUTING_WEIGHTS, STARVATION constants |

### packages/hive-gw/src/
| File | Why |
|------|-----|
| `services/task-machine.ts` | Assignee hijack guard, null agentId for retry, reject(), retry_count bump, setOutputRefs/appendOutputRefs with version bump |
| `services/registry.ts` | updateLastSeen returns {found, restored}, heartbeat restores offline→online |
| `services/event-bus.ts` | on/off local listeners for internal hooks |
| `services/memory-service.ts` | Namespace prefix maps to actual storage paths (public→public/conclusions, agent→agent) |
| `services/memory-client.ts` | MCP SDK StreamableHTTP transport to Nowledge Mem |
| `services/board-persistence.ts` | Debounced snapshot to Nowledge Mem, startup recovery |
| `services/dispatcher.ts` | Multi-factor scoring: interest(50) + capability(20) + load(0-30) + starvation(0/40) |
| `services/verify-loop.ts` | **NEW** — auto-creates verify sub-tasks on completion, fix sub-tasks on verify failure, max 2 cycles |
| `services/p2p-proxy.ts` | Agent-to-agent relay via Gateway |
| `services/prompt-loader.ts` | fs.watch hot-reload for orchestrator prompt |
| `routes/tasks.ts` | claim checks online, reject route, output_refs in response |
| `routes/events.ts` | POST /events with createEventPublishHandler (agent whitelist) |
| `routes/heartbeat.ts` | Rejects unknown agents, emits agent.online on restore |
| `routes/memory.ts` | Updated limitation comments |
| `routes/feishu-webhook.ts` | Uses FeishuWebhookReceiver from @hive/feishu-mcp (AES decrypt) |
| `index.ts` | Full startup: memoryService → boardPersistence → verifyLoop → prompts → listen |

### packages/feishu-mcp/src/
| File | Why |
|------|-----|
| `index.ts` | 4 tools: read_bitable, write_bitable, read_doc, list_bitables. Comments clarify what's NOT implemented. |
| `webhook-receiver.ts` | AES-256-CBC decrypt + token verify, imported by Gateway |

### docs/
| File | Why |
|------|-----|
| `onboarding.md` | Full API reference, task lifecycle, verify-loop, Feishu (Lark CLI + built-in), routing scoring |
| `orchestrator-prompt.md` | Verify/fix is now Gateway auto-mechanism, reject documented, retry limit = 2 |
| `user-guide.md` | **NEW** — Chinese team guide, zero-code onboarding instructions |

### Root
| File | Why |
|------|-----|
| `README.md` | **NEW** — project entry, commands, architecture diagram |
| `CODE-REVIEW.md` | Review handoff doc (preserved, not deleted) |
| `scripts/setup.sh` | **NEW** — one-command install |
| `scripts/join.sh` | **NEW** — team member interactive join |
| `.agents/skills/lark-*` | 19 Lark CLI skill packages installed |

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Unit tests | `npx vitest run` | 61 passed (12 files) ✅ |
| tsc shared | `./node_modules/.bin/tsc -p packages/shared/tsconfig.json --noEmit` | Pass ✅ |
| tsc feishu-mcp | `./node_modules/.bin/tsc -p packages/feishu-mcp/tsconfig.json --noEmit` | Pass ✅ |
| tsc hive-gw | `./node_modules/.bin/tsc -p packages/hive-gw/tsconfig.json --noEmit` | Pass ✅ |
| git status | `git status` | Clean ✅ |
| Lark CLI | `npx @larksuite/cli doctor` | All checks pass, token valid ✅ |
| Nowledge Mem stress test | `npm run stress-test-mem` | 150/150 writes, 0 errors ✅ (run earlier in session) |
| Smoke test | `npm run smoke` | NOT re-run after final changes ⚠️ |

**Note:** Gateway was not started for a final end-to-end integration test in this session. Smoke test last ran successfully mid-session but not after verify-loop and reject additions.

## Blockers / Dead Ends

1. **Worktree isolation fails when commit_docs=false** — planning files aren't in git, so worktree agents can't see them. Solved by running executors without worktree isolation.
2. **Planner wrote files to ~/hive/.planning/ instead of ~/.planning/** — had to manually copy plan files to correct location for Phase 3.
3. **Phase 3 planner mapped RT-03 (P2P) to starvation prevention** — verifier caught it, required gap closure plan 03-03.
4. **tsconfig rootDir issue from Phase 1** — `rootDir: "src"` resolves to monorepo root. Doesn't affect runtime (tsx ignores it) but makes `tsc --noEmit` noisy. Not fixed.
5. **feishu-mcp write_doc impossible** — Feishu API only supports doc import, not direct editing. Documented as limitation. Lark CLI's `lark-doc` may have workarounds but not verified.

## Next 3 Steps

1. **End-to-end integration test** — Start Gateway (`npm start`), register 2 agents, create a `verification_required: true` task, watch the full cycle: auto-assign → claim → working → done → auto-verify → verify pass/fail → auto-fix. This has never been tested live with VerifyLoop.

2. **Decide feishu-mcp fate** — Gateway still imports `@hive/feishu-mcp/webhook-receiver`. Options: (a) move webhook-receiver to @hive/shared and remove feishu-mcp dependency from hive-gw, (b) keep both paths, (c) replace webhook-receiver with Lark CLI's `lark-event +subscribe`. This is an architecture decision.

3. **Team dry run** — Have one team member run `GATEWAY=http://your-ip:3000 bash scripts/join.sh` from their machine. Verify they can see the board, receive SSE events, and claim a task. This validates the onboarding flow end-to-end.
