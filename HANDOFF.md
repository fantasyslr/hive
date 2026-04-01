# HANDOFF — Hive v2.0 Intelligence Layer 完成

**Date:** 2026-04-01
**Branch:** master
**Tag:** v2.0
**Tests:** 645 passing

## 刚完成的事

v2.0 Intelligence Layer — 4 phases 全部自主执行完成，16/16 requirements satisfied。

| Phase | 内容 | Plans | 验证 |
|-------|------|-------|------|
| 4 | Worker Runtime Foundation | 4/4 | 13/13 ✓ |
| 5 | Structured Memory + History Injection | 3/3 | 10/10 ✓ |
| 6 | Coordinator + Session Mode | 3/3 | 11/11 ✓ |
| 7 | Hook Engine | 2/2 | 10/10 ✓ |

**新增能力：**
- TypeScript 类型化 worker 运行时（Claude/Gemini/Codex adapter）
- 任务完成后 Haiku side query 自动提取结构化结论
- 新任务分配前自动注入历史相关结论（双通道：cosine + LLM fallback）
- coordinate 任务自动分解为子任务 DAG + 全部完成后自动合成
- 声明式 hook 引擎（JSON 配置热重载）

## 审计中发现并修复的问题

gateway `index.ts` 没把 LlmClient 和 HistoryInjector 传给 service —— 代码都写对了但启动时没接线。commit `90244b1` 修复。

## Architecture Decisions (v2.0 新增)

7. **Worker 是类型化运行时，不是 bash wrapper** — `packages/hive-worker/` 是新包，HarnessAdapter 接口 + 3 个 adapter。`worker-adapter.sh` 已删除。
8. **结构化结论用 Haiku side query 提取** — `extractWithLLM()` 在 `@hive/worker`，MemoryService 在 task.completed 时调用。失败 never blocks。
9. **History injection 在 Dispatcher.autoAssign 之前** — HistoryInjector 搜索 top-3 结论注入 contextRef，cosine < 0.3 触发 LLM re-ranking。
10. **CoordinatorService 是 gateway 内部服务** — 监听 task.assigned，用 LLM 分解 coordinate 任务为子任务 DAG。不是 worker。
11. **HookEngine 与硬编码 hook 共存** — VerifyLoop/DependencyUnblocker/CoordinatorService 不变，declarative hooks 是增量的。
12. **LlmClient 需要 ANTHROPIC_API_KEY** — 没有时所有 LLM 功能 gracefully degrade to null（提取用 rawFallback，注入跳过，分解跳过）。

## 已知 Tech Debt

- ToolRegistry 已创建但没被消费（orphaned service）
- worker-bridge 的 startSession 只在 execute 前调用，endSession 未实现
- 3 个 pre-existing TS 错误在 feishu-webhook.ts 和 templates.ts（v1.0 遗留）
- feishu-mcp 命运未决（保留 vs 换 Lark CLI）

## 关键文件

| 文件 | 作用 |
|------|------|
| `packages/hive-worker/` | 新 worker 包（adapters, types, tool registry, LLM client） |
| `packages/hive-gw/src/index.ts` | gateway 入口（所有 service 接线） |
| `packages/hive-gw/src/services/history-injector.ts` | 历史注入 |
| `packages/hive-gw/src/services/coordinator-service.ts` | 任务分解 |
| `packages/hive-gw/src/services/hook-engine.ts` | 声明式 hook |
| `hooks.json` | hook 配置文件 |
| `.planning/milestones/v2.0-ROADMAP.md` | v2.0 完整 archive |
| `.planning/v2.0-MILESTONE-AUDIT.md` | 审计报告 |

## 下一步

1. `/gsd:new-milestone` — 开始 v3.0（前端 UI？团队协作？）
2. 设置 `ANTHROPIC_API_KEY` 环境变量激活 LLM 功能
3. 端到端集成测试 — 启动 gateway，创建 coordinate 任务，验证完整生命周期
