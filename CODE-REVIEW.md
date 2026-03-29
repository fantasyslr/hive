# Hive Code Review Handoff

> 请 reviewer 对照本文档逐项检查。本项目由 Claude Opus 4.6 在一个 session 内从零生成（~2h），无人工代码编写。

## 项目概述

Hive 是一个多 CLI agent 协作系统，让 3-4 人团队的 AI agent（Claude Code / Codex CLI / Gemini CLI）共享记忆、协调任务、接入飞书数据。

**一句话架构：** Gateway 是哑路由器，所有调度智能在主控 agent prompt 里。

## 数字

| 指标 | 值 |
|------|---|
| TypeScript 文件 | 38 |
| 总代码行数 | ~2900 |
| Git commits | 25 |
| 单元测试 | 29 (4 test files, all pass) |
| npm packages | 3 (@hive/shared, hive-gw, @hive/feishu-mcp) |

## 仓库结构

```
~/hive/
├── packages/
│   ├── shared/src/           # 共享类型、Zod schemas、常量
│   │   ├── types.ts          # AgentCard, Task, HiveEvent, RoutingScore, P2P...
│   │   ├── schemas.ts        # Zod v4 验证 schemas
│   │   ├── constants.ts      # 状态机转换表、心跳参数、路由权重
│   │   └── index.ts          # barrel export
│   │
│   ├── hive-gw/src/          # Gateway 服务
│   │   ├── index.ts          # Express 5 入口，启动序列
│   │   ├── config.ts         # 环境变量 + pino logger
│   │   ├── routes/
│   │   │   ├── agents.ts     # POST /agents（注册）、GET /agents、POST /:id/request（P2P）
│   │   │   ├── tasks.ts      # POST /tasks、PATCH /:id、POST /:id/claim|retry
│   │   │   ├── board.ts      # GET /board（看板快照）
│   │   │   ├── events.ts     # GET /events/stream（SSE）
│   │   │   ├── heartbeat.ts  # POST /heartbeat/:agentId
│   │   │   ├── memory.ts     # GET /memory/search
│   │   │   ├── docs.ts       # GET /docs/onboarding、/docs/orchestrator-prompt
│   │   │   └── feishu-webhook.ts  # POST /webhooks/feishu
│   │   ├── services/
│   │   │   ├── registry.ts       # Agent 注册表（在线/离线状态）
│   │   │   ├── task-machine.ts   # 任务状态机（optimistic locking）
│   │   │   ├── dispatcher.ts     # 多因素评分分配器（interest + capability + load + starvation）
│   │   │   ├── event-bus.ts      # SSE 广播 + ring buffer + 本地监听器
│   │   │   ├── memory-client.ts  # MCP SDK 连 Nowledge Mem
│   │   │   ├── memory-service.ts # 记忆读写 + 自动沉淀 hooks
│   │   │   ├── board-persistence.ts  # Board 快照持久化 + 重启恢复
│   │   │   ├── p2p-proxy.ts      # Agent 间直接通信代理
│   │   │   └── prompt-loader.ts  # 主控 prompt 热重载（fs.watch）
│   │   └── middleware/
│   │       ├── validate.ts       # Zod 验证中间件
│   │       └── error-handler.ts  # 全局错误处理
│   │
│   └── feishu-mcp/src/       # 飞书 MCP Server（独立进程）
│       ├── index.ts           # MCP Server 入口（StdioServerTransport）
│       ├── feishu-auth.ts     # tenant_access_token 管理
│       ├── feishu-client.ts   # HTTP 客户端（auth + rate limiting）
│       ├── rate-limiter.ts    # Token bucket 速率控制
│       ├── webhook-receiver.ts # Webhook 签名验证 + AES 解密
│       └── tools/
│           ├── read-bitable.ts
│           ├── write-bitable.ts
│           ├── read-doc.ts
│           └── list-bitables.ts
│
├── docs/
│   ├── onboarding.md          # Agent 加入指南
│   └── orchestrator-prompt.md # 主控调度逻辑
│
└── scripts/
    ├── smoke-test.sh          # 端到端 smoke test
    ├── discover-mem-tools.ts  # Nowledge Mem 工具发现
    └── stress-test-mem.ts     # 并发写入压测
```

## Review 重点（按优先级）

### P0: 架构合理性

1. **状态机是否可绕过？**
   - 文件：`task-machine.ts`
   - 检查：所有状态转换是否都经过 `transition()` 方法？有没有直接修改 task 状态的路径？
   - 关注：`VALID_TRANSITIONS` 常量是否完整覆盖了所有合法转换

2. **EventBus ring buffer 是否有内存泄漏风险？**
   - 文件：`event-bus.ts`
   - 检查：buffer 容量限制（1000 条）是否生效？旧事件是否被正确丢弃？
   - 关注：SSE channel 连接关闭时是否清理？

3. **双路径记忆写入是否有竞态？**
   - 文件：`memory-service.ts`, `routes/tasks.ts`
   - 检查：`setOutputRefs`（替换）和 `appendOutputRefs`（追加）两个方法的语义是否正确？
   - 关注：异步写入失败是否真的不阻塞任务状态转换

### P1: 安全与健壮性

4. **Optimistic locking 实现**
   - 文件：`task-machine.ts`
   - 检查：`version` 字段是否在每次 transition 时递增？`claim` 是否正确返回 409？

5. **心跳 ghost agent 检测**
   - 文件：`heartbeat.ts`, `registry.ts`
   - 检查：35s 超时（15s*2 + 5s）计算是否正确？sweeper interval 是否合理？
   - 关注：agent 掉线后是否正确 emit `agent.offline` 事件

6. **飞书 Webhook 安全**
   - 文件：`feishu-webhook.ts`, `webhook-receiver.ts`
   - 检查：token 验证是否在处理 payload 之前？AES 解密是否正确使用 SHA-256 派生 key？
   - 关注：`feishu-webhook.ts` 是否正确使用了 `FeishuWebhookReceiver`（之前有过内联重复实现的 gap，已修复）

7. **速率控制**
   - 文件：`rate-limiter.ts`
   - 检查：token bucket 实现是否正确？429 重试是否有指数退避？max retry 是否有上限？

### P2: 代码质量

8. **类型安全**
   - 检查：`as unknown as` 类型断言是否过多？有没有可以用类型守卫替代的地方？
   - 关注：`shared/types.ts` 的 interface 设计是否合理

9. **错误处理一致性**
   - 检查：所有路由是否都有统一的错误响应格式？`error-handler.ts` 是否覆盖了所有边界情况？

10. **评分公式合理性**
    - 文件：`dispatcher.ts`
    - 检查：`scoreAgent()` 的权重 (interest=50, capability=20, load=0-30, starvation=0/40) 是否合理？
    - 关注：starvation boost (60s idle → +40) 是否会导致不适合的 agent 接到任务？

### P3: 可运维性

11. **日志是否足够 debug？**
    - 检查：关键路径（任务分配、记忆写入、P2P 转发、飞书事件）是否都有 pino 日志？
    - 关注：日志级别是否合理（info vs warn vs error）

12. **优雅降级**
    - 检查：Nowledge Mem 挂了，Gateway 是否还能启动？飞书 credentials 没配，是否跳过而非崩溃？

## 已知问题（不需要修）

| 问题 | 原因 | 影响 |
|------|------|------|
| tsconfig rootDir 解析错误 | Phase 1 遗留，`rootDir: "src"` 解析到 monorepo root | `tsc --noEmit` 报错，但 tsx 运行时不受影响 |
| Namespace 隔离是约定而非强制 | 设计决策：团队小，信任优先 | 任何 agent 可读 `agent/{id}/*`，无 ACL |
| 飞书文档不可编辑 | 飞书 API 限制（仅支持 import） | `read_doc` 可用，`write_doc` 不存在 |
| Webhook 需内网穿透 | Gateway 在本地 Mac，飞书回调需公网 URL | 生产使用需配 ngrok 或类似工具 |

## 如何跑起来

```bash
# 1. 安装依赖
cd ~/hive && npm install

# 2. 跑测试
npx vitest run

# 3. 启动 Gateway（需要 Nowledge Mem 桌面应用运行中）
cd packages/hive-gw && npx tsx src/index.ts

# 4. Smoke test（另一个终端）
bash scripts/smoke-test.sh

# 5. 发现 Nowledge Mem 工具
npx tsx scripts/discover-mem-tools.ts

# 6. 并发压测
npx tsx scripts/stress-test-mem.ts
```

## 环境变量

```bash
# Gateway (packages/hive-gw)
PORT=3000                          # Gateway 端口（默认 3000）

# Feishu (packages/feishu-mcp)
FEISHU_APP_ID=xxx                  # 飞书应用 ID
FEISHU_APP_SECRET=xxx              # 飞书应用 Secret
FEISHU_WEBHOOK_VERIFY_TOKEN=xxx    # Webhook 验证 token
FEISHU_ENCRYPT_KEY=xxx             # Webhook 加密 key（可选）
```

## Review 后的下一步

- [ ] 修复 reviewer 发现的问题
- [ ] 修复 tsconfig rootDir 问题
- [ ] 端到端集成测试（实际注册 2 个 agent，完成一个任务循环）
- [ ] 配置飞书 Webhook + 内网穿透
- [ ] 写 onboarding 的实际注册脚本（给团队成员用）
