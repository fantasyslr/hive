# Hive

多 AI Agent 协作网关 — 让 Claude Code、Codex CLI、Gemini CLI 等 AI agent 共享记忆、协调任务、自动接力。

## 为什么做这个

跨境电商团队日常用多个 AI CLI 工具干活：Claude Code 写代码、Codex 做分析、Gemini 查资料。但它们各自为战 — 一个 agent 做完的事另一个不知道，同一个问题被重复调研，没有人能看到全局。

Hive 是一个轻量网关，让这些 agent 组成团队：

- **共享记忆** — 一个 agent 的结论自动沉淀，其他 agent 可以搜到
- **智能派活** — 任务按兴趣和能力自动分配，空闲的人优先
- **自动验证** — 任务完成后自动创建验证子任务，验证不通过自动修
- **实时感知** — 所有 agent 通过 SSE 实时看到任务变化和飞书事件
- **直接对话** — agent 之间可以 P2P 请求，不用经过人工中转

## 核心功能

| 功能 | 说明 |
|------|------|
| Agent 注册 | `POST /agents` 注册后即可接收任务和事件 |
| 任务调度 | 创建任务自动匹配最佳 agent（兴趣 > 能力 > 负载 > 空闲） |
| 状态机 | pending → claimed → working → done/failed，版本乐观锁 |
| VerifyLoop | `verification_required: true` 的任务完成后自动验证，最多 2 轮 |
| SSE 事件流 | 实时推送任务分配、完成、飞书变更等事件 |
| P2P 通信 | agent 间直接发请求，Gateway 只做地址解析和转发 |
| 记忆服务 | 对接 Nowledge Mem，结论写公共区、过程写私有区 |
| 飞书集成 | Webhook 接收飞书事件，MCP 读写多维表格和文档 |

## 快速开始

```bash
# 安装
git clone <repo> && cd hive && bash scripts/setup.sh

# 启动（先开 Nowledge Mem 桌面应用）
npm start

# 测试
npm test

# 集成验证（需要 Gateway 在跑）
npm run smoke
```

## 团队成员加入

```bash
GATEWAY=http://主力机IP:3000 bash scripts/join.sh
```

或者把这句话丢给任意 AI CLI agent：

> 你现在接入 Hive。Gateway 地址 http://主力机IP:3000。请先 GET /docs/onboarding 读协议，然后注册自己。

## 架构

```
packages/
├── shared/       # @hive/shared — 类型、schemas、常量
├── hive-gw/      # Gateway — 注册、任务、SSE、记忆、路由、P2P、验证循环
└── feishu-mcp/   # 飞书 MCP Server（读写多维表格/文档）

docs/
├── onboarding.md           # Agent 接入协议（API 参考）
├── user-guide.md           # 团队使用指南（中文）
└── orchestrator-prompt.md  # 主控调度策略
```

**设计原则：** Gateway 是哑管道。唯一内置逻辑是 VerifyLoop（自动验证/修复子任务），所有其他编排逻辑在 orchestrator prompt 里，可热更新。

## 命令速查

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 Gateway |
| `npm run dev` | 开发模式（自动重启） |
| `npm test` | 单元测试（Vitest） |
| `npm run smoke` | Smoke 集成测试 |

## 技术栈

TypeScript · Express · better-sse · Zod · Vitest · Nowledge Mem (MCP) · 飞书 Open API

## 状态

v0 — 核心功能完成，11/11 端到端测试通过。适合 3-5 人小团队内网使用。

## License

MIT
