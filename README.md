# Hive

多 CLI agent 透明协作系统 — 让 AI agent 共享记忆、协调任务、自动接力。

## 一键安装

```bash
cd ~/hive && bash scripts/setup.sh
```

## 启动

```bash
# 启动 Gateway（开 Nowledge Mem 桌面应用后）
npm start

# 开发模式（自动重启）
npm run dev

# 跑测试
npm test

# Smoke 测试（需要 Gateway 在跑）
npm run smoke
```

## 团队成员加入

```bash
# 在团队成员的电脑上跑
GATEWAY=http://主力机IP:3000 bash scripts/join.sh
```

或者直接把这段话丢进 CLI agent：

> 你现在接入 Hive。Gateway 地址 http://主力机IP:3000。请先 GET /docs/onboarding 读协议，然后注册自己。

## 文档

| 文档 | 说明 |
|------|------|
| [User Guide](docs/user-guide.md) | 团队使用指南（中文） |
| [Onboarding](docs/onboarding.md) | Agent 接入协议（API 参考） |
| [Orchestrator Prompt](docs/orchestrator-prompt.md) | 主控调度策略 |
| http://localhost:3000/docs/onboarding | 在线版（Gateway 运行时） |

## 架构

```
packages/
├── shared/       # @hive/shared — 共享类型、schemas、常量
├── hive-gw/      # Gateway — 注册、任务、SSE、记忆、路由、P2P、验证循环
└── feishu-mcp/   # 飞书 MCP Server（备用，主力用 @larksuite/cli）
```

## 命令速查

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 Gateway |
| `npm run dev` | 开发模式 |
| `npm test` | 跑测试 |
| `npm run smoke` | Smoke 测试 |
| `npm run setup` | 一键安装 |
| `npm run discover-mem` | 发现 Nowledge Mem 工具 |
| `npm run stress-test-mem` | 并发写入压测 |
