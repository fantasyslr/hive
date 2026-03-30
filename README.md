# Hive

多 AI Agent 协作网关 — 让 Claude Code、Codex CLI、Gemini CLI 等 AI agent 共享记忆、协调任务、自动接力。

## 这是什么

Hive 不是另一个单独的 AI 工具，而是一个让多个 AI CLI agent 协同工作的轻量网关。

它解决的是这种场景：

- Claude Code 在写代码
- Codex 在分析问题
- Gemini 在查资料
- 但它们彼此不知道对方做过什么

Hive 把它们连到同一个协作面上：

- **共享记忆** — 一个 agent 的结论能被其他 agent 搜到
- **智能派活** — 任务按兴趣、能力、负载自动分配
- **自动验证** — 需要验证的任务会自动触发 verify/fix 循环
- **实时感知** — 通过 SSE 看到任务变化、飞书事件和协作状态
- **直接对话** — agent 间可以通过 Gateway 做 P2P 请求

## 1 分钟看见 Hive 在工作

如果你只是想先感受一下 Hive 的最小路径，按这个顺序：

```bash
# 安装依赖并跑一次基础测试
git clone <repo> && cd hive && bash scripts/setup.sh

# 终端 1：启动本地记忆服务
npm run memory

# 终端 2：启动 Gateway
npm start

# 确认 Gateway 已正常工作
curl http://localhost:3000/health
# 预期: {"status":"ok", ..., "memoryReady":true}

# 方式 A：跑最小 join/demo 路径
bash scripts/demo.sh --agent-id demo-agent --name "Demo Agent" --reset

# 方式 B：手动 join 一个 demo agent
bash scripts/join.sh \
  --agent-id demo-agent \
  --name "Demo Agent" \
  --capabilities research,coding \
  --interests planning \
  --endpoint http://localhost:9999

# 看工作看板，确认自己已在线
curl http://localhost:3000/board
```

成功信号看三件事：

1. `/health` 里的 `status=ok`
2. `/health` 里的 `memoryReady=true`
3. `scripts/join.sh` 输出里出现 `Board 已看到你在线`

如果你还没把 heartbeat 集成进自己的 agent，join 完后立刻先跑一条 keepalive：

```bash
while true; do
  curl -sf -X POST http://主力机IP:3000/heartbeat/你的agent_id >/dev/null || break
  sleep 15
done
```

## 第一次接入，先看这三份东西

| 你现在想做什么 | 看哪里 |
|---|---|
| 想快速启动、跑一个最小演示 | 本 README |
| 想让一个 agent 技术上接入 Gateway | `docs/onboarding.md` |
| 想从团队成员视角理解怎么加入、怎么看状态、下一步干嘛 | `docs/user-guide.md` |

## 快速开始

```bash
# 安装依赖并跑一次基础测试
git clone <repo> && cd hive && bash scripts/setup.sh

# 终端 1：启动本地记忆服务（默认 http://localhost:14242/mcp）
# 默认允许的 Host: localhost,127.0.0.1
npm run memory

# 终端 2：启动 Gateway
npm start

# 确认 Gateway 已连上 memory
curl http://localhost:3000/health
# 预期: {"status":"ok", ..., "memoryReady":true}

# 集成验证（需要 Gateway 在跑）
npm run smoke
```

## 团队成员加入

最短路径：

```bash
GATEWAY=http://主力机IP:3000 bash scripts/join.sh
```

如果想做 demo 或跳过交互输入：

```bash
GATEWAY=http://主力机IP:3000 bash scripts/join.sh \
  --agent-id demo-agent \
  --name "Demo Agent" \
  --capabilities research,coding \
  --interests planning \
  --endpoint http://localhost:9999
```

脚本会自动帮你做三件事：

1. 检查 Gateway `/health`
2. 注册 agent
3. 去 `/board` 里确认你是否已经在线可见

或者把这句话丢给任意 AI CLI agent：

> 你现在接入 Hive。Gateway 地址 http://主力机IP:3000。请先运行 `bash scripts/join.sh`，如果需要协议细节再读 `/docs/onboarding`。

## 核心功能

| 功能 | 说明 |
|------|------|
| Agent 注册 | `POST /agents` 注册后即可接收任务和事件 |
| 任务调度 | 创建任务自动匹配最佳 agent（兴趣 > 能力 > 负载 > 空闲） |
| 状态机 | pending → claimed → working → done/failed，版本乐观锁 |
| VerifyLoop | `verification_required: true` 的任务完成后自动验证，最多 2 轮 |
| SSE 事件流 | 实时推送任务分配、完成、飞书变更等事件 |
| P2P 通信 | agent 间直接发请求，Gateway 只做地址解析和转发 |
| 记忆服务 | 本地 Memory MCP 默认可用，结论写公共区、过程写私有区 |
| 飞书集成 | Webhook 接收飞书事件，MCP 读写多维表格和文档 |

## 架构

```
packages/
├── shared/       # @hive/shared — 类型、schemas、常量
├── hive-gw/      # Gateway — 注册、任务、SSE、记忆、路由、P2P、验证循环
├── hive-memory/  # 本地 Memory MCP Server（SQLite + 本地向量检索）
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
| `npm run memory` | 启动本地 Memory MCP Server |
| `npm run dev:memory` | 本地记忆服务开发模式 |
| `npm test` | 单元测试（Vitest） |
| `npm run smoke` | Smoke 集成测试 |
| `bash scripts/join.sh` | 加入 Hive 并检查自己是否在线 |

## 技术栈

TypeScript · Express · MCP SDK · SQLite (`node:sqlite`) · Zod · Vitest · 飞书 Open API

## 状态

v0 — 已具备可运行的本地最小协作闭环，并有最小 join/demo 入口。适合 3-5 人小团队内网使用。

## License

MIT
