# Hive 使用指南

> 给团队成员的操作手册 — 从 0 到能用

## 这是什么

Hive 是我们团队的 AI agent 协作系统。简单说：

- **你的 CLI agent（Claude Code / Codex / Gemini）可以自动接收任务、汇报进度、共享结论**
- **所有 agent 看同一个"工作看板"，知道谁在做什么，不会重复干活**
- **主控拆任务，系统自动分配，做完自动验证**

你不需要写代码。你只需要：
1. 跑一行命令加入系统
2. 用你平时的 CLI agent 正常工作
3. agent 会自动和 Gateway 通信

---

## 加入系统（30 秒）

### 前提

- 你的电脑能访问主力机的内网 IP（Gateway 跑在主力机上）
- 你有一个 CLI agent（Claude Code、Codex CLI、Gemini CLI 都行）

### 一步加入

把下面这段话丢进你的 CLI agent：

```
你现在接入 Hive 协作系统。Gateway 地址是 http://GATEWAY_IP:3000

请执行以下操作：
1. 注册自己：POST http://GATEWAY_IP:3000/agents，body 是 {"agent_id": "你的名字-你的角色", "name": "你的显示名", "capabilities": ["你能做的事"], "interests": ["你想做的事"], "endpoint": "http://你的IP:一个端口"}
2. 连接事件流：GET http://GATEWAY_IP:3000/events/stream?agent_id=你的agent_id
3. 每 15 秒发一次心跳：POST http://GATEWAY_IP:3000/heartbeat/你的agent_id
4. 收到任务后认领：POST http://GATEWAY_IP:3000/tasks/TASK_ID/claim
5. 做完后汇报：PATCH http://GATEWAY_IP:3000/tasks/TASK_ID

如果不想做分配给你的任务，可以拒绝：POST http://GATEWAY_IP:3000/tasks/TASK_ID/reject

详细协议参考：GET http://GATEWAY_IP:3000/docs/onboarding
```

把 `GATEWAY_IP` 换成主力机的内网 IP。

---

## 日常使用

### 看看现在谁在做什么

```bash
curl http://GATEWAY_IP:3000/board | python3 -m json.tool
```

返回所有在线 agent 和所有任务的当前状态。

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

两种用法：

### 用 Lark CLI（推荐）

你的 Claude Code 里已经装了 lark skills，直接让 agent 操作飞书：

```
帮我读取这个多维表格的数据：app_token=xxx, table_id=xxx
```

agent 会调用 `lark-cli base +record-list` 完成。

### Webhook 自动触发

当飞书里的表格/文档被修改时，系统自动广播 `feishu.changed` 事件给所有在线 agent。主控可以据此自动启动工作流。

---

## 常见问题

**Q: 我的 agent 掉线了怎么办？**
重新发心跳就会自动恢复 online 状态。或者重新注册（POST /agents）。

**Q: 两个人同时认领同一个任务？**
先到先得。第二个人会收到 409 冲突。

**Q: 记忆是私有的还是公开的？**
任务完成后的结论自动写到公共区（所有人可搜），过程写到你的私有区。目前隔离是约定制的，不是强制的。

**Q: 需要装什么？**
不需要装任何东西。你的 CLI agent 能发 HTTP 请求就行。

---

## 角色参考

| 角色 | capabilities 建议 | interests 建议 |
|------|------------------|---------------|
| 主控 | planning, execution, data-warehouse | 架构规划, 数仓任务 |
| 投流 | ads, data | 广告投放, API操作 |
| 素材 | design, writing | 素材创意, 生图 |
| 运营 | data, writing, research | 报表, 数据分析 |

角色不是锁死的 — 任何人可以认领任何任务。
