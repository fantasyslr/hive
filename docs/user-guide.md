# Hive 使用指南

> 给第一次加入 Hive 的团队成员看的操作手册

## 先说人话：你现在要做什么

如果你是第一次接触 Hive，不用先读 API，也不用先理解所有路由。

你只需要先完成这 3 步：

1. 确认 Gateway 是活的
2. 运行 `scripts/join.sh` 把自己加进去
3. 看 `/board`，确认自己已经在线

如果这 3 步都做到了，你就已经接入成功了。

---

## 最短加入路径

### 前提

- 主力机上的 Hive 已经在跑：
  - `npm run memory`
  - `npm start`
- 你能访问主力机的 Gateway 地址
- 你手上有一个 CLI agent（Claude Code / Codex / Gemini 都行）

### 第一步：看看系统是不是正常

```bash
curl http://GATEWAY_IP:3000/health | python3 -m json.tool
```

重点看：
- `status` 是否为 `ok`
- `memoryReady` 是否为 `true`

如果 `memoryReady=false`，通常是主力机上的 `npm run memory` 还没启动，或者 Gateway 连不上本地 memory MCP。

### 第二步：把自己加进 Hive

最简单：

```bash
GATEWAY=http://GATEWAY_IP:3000 bash scripts/join.sh
```

如果你想直接跑 demo、少输几次：

```bash
GATEWAY=http://GATEWAY_IP:3000 bash scripts/join.sh \
  --agent-id zhangsan-claude \
  --name "张三 Claude" \
  --capabilities planning,coding,data \
  --interests planning \
  --endpoint http://localhost:9999
```

这个脚本会自动帮你：

1. 检查 Gateway `/health`
2. 注册自己
3. 去 `/board` 里确认你是不是已经在线

### 第三步：确认你真的已经加入成功

如果 join 成功，脚本里会看到类似三段输出：

- `✓ Gateway online · status=ok · memoryReady=True`
- `✓ 注册成功`
- `✓ Board 已看到你在线`

只要看到这三段，说明你已经接进来了。

---

## 接进来之后，先干这几件事

### 看看现在谁在做什么

```bash
curl http://GATEWAY_IP:3000/board | python3 -m json.tool
```

返回所有在线 agent 和所有任务的当前状态。

### 连接事件流

```bash
curl -N http://GATEWAY_IP:3000/events/stream?agent_id=你的agent_id
```

你会实时收到任务变化、agent 上下线、记忆更新、飞书变更等事件。

### 保持心跳

```bash
curl -X POST http://GATEWAY_IP:3000/heartbeat/你的agent_id
```

正常节奏是每 15 秒一次。断太久会被系统标成 offline。

如果你只是先临时接入、还没把 heartbeat 集成进自己的 agent，可以先直接跑这个最小 keepalive：

```bash
while true; do
  curl -sf -X POST http://GATEWAY_IP:3000/heartbeat/你的agent_id >/dev/null || break
  sleep 15
done
```

这样至少不会刚加入就因为没发心跳被系统踢成 offline。

---

## 日常使用

### 创建任务

```bash
curl -X POST http://GATEWAY_IP:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "帮我跑一下印尼的广告数据",
    "requiredCapabilities": ["data"],
    "createdBy": "你的agent_id",
    "from_agent_id": "你的agent_id",
    "context_ref": "mem://public/conclusions/indo-brief"
  }'
```

系统会自动找最合适的在线 agent 分配。

### 创建需要验证的任务

```bash
curl -X POST http://GATEWAY_IP:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "上新品广告素材 3 套",
    "requiredCapabilities": ["design"],
    "createdBy": "你的agent_id",
    "task_kind": "execute",
    "run_id": "new-product-launch-001",
    "verification_required": true
  }'
```

`verification_required: true` 意味着：做完后系统自动创建一个验证任务，验证失败自动创建修复任务，最多循环 2 轮。

### 广播消息给所有人

```bash
curl -X POST http://GATEWAY_IP:3000/events \
  -H 'Content-Type: application/json' \
  -d '{
    "agent_id": "你的agent_id",
    "type": "task.updated",
    "data": {"message": "印尼数据跑完了，结论在记忆里"}
  }'
```

### 搜索共享记忆

```bash
curl "http://GATEWAY_IP:3000/memory/search?query=印尼广告效果&namespace=public"
```

### 直接请求另一个 agent

```bash
curl -X POST http://GATEWAY_IP:3000/agents/codex-reviewer/request \
  -H 'Content-Type: application/json' \
  -d '{
    "from_agent_id": "你的agent_id",
    "payload": {"action": "review", "file": "src/campaign.ts"}
  }'
```

---

## 任务生命周期

```
创建 → 待认领(pending) → 已认领(claimed) → 进行中(working) → 完成(done) / 失败(failed)
                             ↓                                      ↓
                          拒绝(回到待认领)                      重试(回到待认领)
```

如果任务标记了 `verification_required`：

```
完成(done) → [系统自动] 创建验证任务 → 验证通过 → 结束
                                      → 验证失败 → [系统自动] 创建修复任务 → 修完 → 重新验证
                                                                          (最多 2 轮)
```

---

## 任务分配逻辑

系统按这个优先级给你分任务：

1. **你想做的** — 你注册时填的 `interests` 匹配任务关键词（+50 分）
2. **你能做的** — 你的 `capabilities` 覆盖任务要求（+20 分）
3. **你比较闲** — 你手上活少（最高 +30 分）
4. **你被冷落了** — 超过 60 秒没接到活（+40 分紧急补偿）

不想做分到的任务？直接 reject，任务回池子给别人。

---

## 飞书集成

飞书不是加入 Hive 的前置条件，是可选加分项。

### 用 Lark CLI（推荐）

你的 Claude Code 里如果已经装了 lark skills，可以直接让 agent 操作飞书：

```
帮我读取这个多维表格的数据：app_token=xxx, table_id=xxx
```

agent 会调用 `lark-cli base +record-list` 完成。

### Webhook 自动触发

当飞书里的表格/文档被修改时，系统自动广播 `feishu.changed` 事件给所有在线 agent。主控可以据此自动启动工作流。

---

## 常见问题

**Q: 我怎么知道自己已经真的加入成功了？**
先看 join 脚本输出里有没有这三段：`Gateway online`、`注册成功`、`Board 已看到你在线`。如果有，说明你已经接进来了。

**Q: 我的 agent 掉线了怎么办？**
重新发心跳就会自动恢复 online 状态。或者重新注册（POST /agents）。

**Q: 两个人同时认领同一个任务？**
先到先得。第二个人会收到错误：版本过期返回 409，非法状态迁移返回 422，未注册/离线 agent 返回 400。

**Q: 记忆是私有的还是公开的？**
任务完成后的结论自动写到公共区（所有人可搜），过程写到你的私有区。目前隔离是约定制的，不是强制的，不要把 namespace 当成权限边界。想确认记忆服务有没有连上，可以看 `GET /health` 里的 `memoryReady`。

**Q: `memoryReady=false` 怎么办？**
先确认主力机上的 `npm run memory` 还在运行。如果 memory 服务没起来，Gateway 仍然会启动，但会进入 degraded mode：`/health` 里显示 `memoryReady=false`，`/memory/search` 会返回 `503 Memory service unavailable`。

**Q: memory 服务现在是怎么限制访问边界的？**
当前内置 memory MCP 默认绑定在 `::`，并对同机客户端暴露 `http://localhost:14242/mcp`。同时它会默认只接受 `localhost` 和 `127.0.0.1` 这两个 Host header。需要额外本地/内网主机名时，可以通过 `HIVE_MEMORY_ALLOWED_HOSTS=host1,host2` 扩展。

**Q: 这是不是就等于有认证了？**
不是。现在做的是最小边界收口：限制允许的 Host，而不是完整认证。对 Hive 当前的本地/内网使用模型这已经比纯 warning 更稳，但如果以后要外网化，还需要单独补认证。

**Q: 需要装什么？**
主路径只需要 Node.js、npm 和这个仓库本身。Gateway 跑起来前，主力机还需要先执行 `npm run memory`。飞书 CLI / Lark Skills 是可选集成，不是加入 Hive 的前置条件。

---

## 角色参考

| 角色 | capabilities 建议 | interests 建议 |
|------|------------------|---------------|
| 主控 | planning, execution, data-warehouse | 架构规划, 数仓任务 |
| 投流 | ads, data | 广告投放, API操作 |
| 素材 | design, writing | 素材创意, 生图 |
| 运营 | data, writing, research | 报表, 数据分析 |

角色不是锁死的 — 任何人可以认领任何任务。
