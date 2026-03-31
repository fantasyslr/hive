# Hive — AI-Native Team Kanban

团队看板，AI 做重活。创建一个 Campaign，AI 自动拆分子任务、分配给不同 Agent、执行、交结果，人只需要看和调整。

## 30 秒看懂

```
主管创建 Campaign "Q3 日本彩片推广"
    │
    ▼  自动拆分
Market Research (无依赖)     → Claude 自动领取 → 20s 后交回调研报告
    │
    ├──▶ Ad Strategy         → Gemini 自动领取 → 30s 后交回投放方案
    ├──▶ Creative Assets     → Gemini 自动领取 → 20s 后交回素材清单
    │
    ▼  依赖自动解锁
Manager Review               → Claude 自动领取 → 综合评审 → Done
```

4 个子任务，2 个 AI Worker，全程零人工干预。打开浏览器实时看到卡片在列之间自动流转。

## 快速启动

```bash
git clone https://github.com/fantasyslr/hive.git && cd hive

# 安装依赖
bash scripts/setup.sh

# 终端 1：启动 Gateway + Memory
npm run dev

# 终端 2：启动前端看板
npm run dev:ui

# 终端 3：启动 AI Worker（需要 Claude CLI 已安装）
HIVE_TOKEN=hive-token-manager npm run worker:claude
```

打开 http://localhost:5173 看看板。局域网其他设备访问 `http://<你的IP>:5173`。

## 创建第一个 Campaign

```bash
curl -X POST http://localhost:3000/templates/campaign/launch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer hive-token-manager" \
  -d '{"title":"Q3 Japan Colored Lenses Campaign"}'
```

然后看着看板——AI Worker 会自动领取、执行、交结果。

## 核心能力

| 能力 | 说明 |
|------|------|
| **AI Worker 自动执行** | Claude/Gemini/Codex CLI 注册为 Agent，自动领任务、干活、交结果 |
| **Campaign 模板** | 一键创建带依赖关系的子任务组，JSON 热加载，不重启 |
| **依赖 DAG 自动流转** | 子任务完成后自动解锁下游任务并分配 |
| **共享记忆** | 每次任务的过程和结论存入 Memory，AI 下次接活时自动获取相关上下文 |
| **实时看板 UI** | React + SSE，卡片自动流转，Working 有脉冲动画，点击查看 AI 产出 |
| **智能派活** | 兴趣 > 能力 > 负载 > 空闲，加版本乐观锁防重领 |
| **自动验证** | VerifyLoop — 需要验证的任务自动触发 verify/fix 循环，最多 2 轮 |
| **角色认证** | 4 个固定角色（投放/运营/素材/主管），Bearer token，主管看全部 |

## 架构

```
packages/
├── hive-gw/      # Gateway — Express API，任务调度，SSE，认证
├── hive-ui/      # 看板 UI — React 19 + Vite + Tailwind v4
├── hive-memory/  # Memory MCP Server — SQLite + 向量检索 + 去重 + TTL
├── shared/       # @hive/shared — 类型、Zod schemas、常量
└── feishu-mcp/   # 飞书集成 — 读写多维表格和文档

scripts/
├── worker-bridge.ts      # AI Worker 运行时（注册、心跳、领活、执行）
├── worker-adapter.sh     # CLI 适配器（Claude/Gemini/Codex）
└── start-worker-profile.sh  # 按角色启动 Worker
```

## 启动多个 AI Worker

```bash
# Claude — 规划、审批、总结
HIVE_TOKEN=hive-token-manager npm run worker:claude

# Gemini — 调研、设计、营销
HIVE_TOKEN=hive-token-manager npm run worker:gemini

# Codex — 编码、调试、实现
HIVE_TOKEN=hive-token-manager npm run worker:codex
```

Worker 启动后自动注册，看板 Agent Bar 显示上线状态。

## 命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Gateway（开发模式，自动重启） |
| `npm run dev:ui` | 启动前端看板 |
| `npm run memory` | 启动 Memory MCP Server |
| `npm run worker:claude` | 启动 Claude AI Worker |
| `npm run worker:gemini` | 启动 Gemini AI Worker |
| `npm run worker:codex` | 启动 Codex AI Worker |
| `npm test` | 跑后端测试（Vitest） |
| `npm test -w packages/hive-ui` | 跑前端测试 |
| `npm run smoke` | 集成 smoke 测试 |
| `npm run build:ui` | 构建前端生产版本 |

## 认证

4 个固定用户，Bearer token 认证：

| 角色 | Token | 权限 |
|------|-------|------|
| 投放 | `hive-token-ad-buyer` | 看自己的 + 共享的任务 |
| 运营 | `hive-token-operations` | 同上 |
| 素材 | `hive-token-creative` | 同上 |
| 主管 | `hive-token-manager` | 看所有任务 |

`/health` 和 `/events/stream/public` 无需认证。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无需 auth） |
| GET | `/board` | 看板快照（agents + tasks） |
| POST | `/tasks` | 创建任务 |
| PATCH | `/tasks/:id` | 更新任务状态 |
| GET | `/agents` | Agent 列表 |
| POST | `/agents` | 注册 Agent |
| GET | `/templates` | 模板列表 |
| POST | `/templates/:id/launch` | 从模板创建 Campaign |
| GET | `/events/stream/public` | SSE 公开事件流（无需 auth） |
| GET | `/memory/search` | 搜索共享记忆 |

## 技术栈

TypeScript · Express 5 · React 19 · Vite · Tailwind v4 · SQLite WAL · Zod v4 · MCP SDK · Vitest · SSE (better-sse)

## 测试

```bash
npm test                        # 后端：27 files / 159 tests
npm test -w packages/hive-ui    # 前端：6 files / 17 tests
```

## 状态

v1.1 — AI Worker 自动执行已跑通。Campaign DAG 全自动流转。适合 3-5 人小团队局域网使用。

## License

MIT
