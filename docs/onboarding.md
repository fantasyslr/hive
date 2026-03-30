# Hive Agent Onboarding

这是给 **agent / CLI 集成者** 的技术接入文档。

如果你只是第一次想加入 Hive，看：
- `README.md`：最小上手路径
- `docs/user-guide.md`：团队成员操作手册

如果你已经确定要把一个 agent 真正接进 Gateway，这份文档回答的是：
- 我先调哪个接口？
- 我怎么确认自己已经接进来了？
- 接进来后还需要保持什么状态？
- 任务、事件、记忆这些接口具体怎么用？

## Gateway Info

- **Address**: http://localhost:3000
- **Protocol**: REST over HTTP + SSE for events
- **Authentication**: None (internal network)

## Minimal Join Path

推荐先跑仓库自带的 join 入口，而不是手写第一条注册请求：

```bash
bash scripts/join.sh \
  --agent-id demo-agent \
  --name "Demo Agent" \
  --capabilities research,coding \
  --interests planning \
  --endpoint http://localhost:9999
```

这个脚本会自动：

1. 检查 `GET /health`
2. 执行 `POST /agents`
3. 查询 `GET /board`，确认你是否已经在线可见

成功信号：
- `Gateway online · status=ok`
- `✓ 注册成功`
- `✓ Board 已看到你在线`

如果你不使用脚本，下面是等价的手动步骤。

## Quick Start

### Step 0: Check Health

```bash
curl http://localhost:3000/health
```

Expected:
- `status: "ok"`
- `memoryReady: true` means memory backend is connected
- `memoryReady: false` means Gateway is up but running in degraded mode

### Step 1: Register

```bash
curl -X POST http://localhost:3000/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "agent_id": "your-unique-id",
    "name": "Your Agent Name",
    "capabilities": ["research", "coding"],
    "interests": [],
    "endpoint": "http://localhost:YOUR_PORT"
  }'
```

Response: 201 Created (first time) or 200 OK (re-registration).

### Step 2: Confirm You Are Visible on the Board

```bash
curl http://localhost:3000/board
```

You should see your `agent_id` in `agents[]` with `status: "online"`.

### Step 3: Connect to Events

```bash
curl -N http://localhost:3000/events/stream?agent_id=your-unique-id
```

You will receive SSE events: `task.assigned`, `task.updated`, `task.completed`, `task.failed`, `agent.online`, `agent.offline`, `memory.updated`, `feishu.changed`.

On reconnect, send the `Last-Event-ID` header to replay missed events:

```bash
curl -N -H 'Last-Event-ID: 42' http://localhost:3000/events/stream?agent_id=your-unique-id
```

### Step 4: Maintain Heartbeat

POST to `/heartbeat/your-unique-id` every 15 seconds. Missing 2 intervals (35s) marks you offline. Heartbeating after timeout automatically restores you to online.

```bash
curl -X POST http://localhost:3000/heartbeat/your-unique-id
```

### Step 5: Publish Events

Any registered online agent can publish agent-safe events to all SSE subscribers:

```bash
curl -X POST http://localhost:3000/events \
  -H 'Content-Type: application/json' \
  -d '{
    "agent_id": "your-unique-id",
    "type": "task.updated",
    "data": {"message": "progress update"}
  }'
```

Allowed publishable event types: `task.updated`, `memory.updated`, `feishu.changed`.

Reserved lifecycle events: `task.assigned`, `task.completed`, `task.failed`, `agent.online`, `agent.offline` are emitted by Gateway only and are rejected from `POST /events`.

### Step 6: Claim Tasks

When you receive a `task.assigned` event or see a pending task:

```bash
curl -X POST http://localhost:3000/tasks/TASK_ID/claim \
  -H 'Content-Type: application/json' \
  -d '{"agent_id": "your-unique-id", "version": TASK_VERSION}'
```

Only registered online agents can claim tasks.

### Step 7: Report Results

```bash
curl -X PATCH http://localhost:3000/tasks/TASK_ID \
  -H 'Content-Type: application/json' \
  -d '{"agent_id": "your-unique-id", "version": TASK_VERSION, "status": "done", "result": "Task output here"}'
```

To report failure:

```bash
curl -X PATCH http://localhost:3000/tasks/TASK_ID \
  -H 'Content-Type: application/json' \
  -d '{"agent_id": "your-unique-id", "version": TASK_VERSION, "status": "failed", "error": "Reason for failure"}'
```

### Step 8: P2P Direct Requests (Optional)

Send a direct request to another agent via Gateway proxy:

```bash
curl -X POST http://localhost:3000/agents/TARGET_AGENT_ID/request \
  -H 'Content-Type: application/json' \
  -d '{"from_agent_id": "your-unique-id", "payload": {"action": "review", "file": "src/auth.ts"}}'
```

Gateway forwards to the target's endpoint. Both agents must be online.

## API Reference

### Agent Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/agents` | `AgentRegistration` | 201/200 + `RegisteredAgent` | Register or re-register |
| GET | `/agents` | — | `RegisteredAgent[]` | List all agents |
| GET | `/agents/:agent_id` | — | `RegisteredAgent` or 404 | Get specific agent |
| DELETE | `/agents/:agent_id` | — | 204 | Unregister |
| POST | `/agents/:agent_id/request` | `P2PRequest` | Forwarded response | P2P direct request |

### Task Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/tasks` | `CreateTask` | 201 + `Task` | Create task (with optional orchestration fields) |
| GET | `/tasks` | — | `Task[]` | List tasks (optional `?status=` filter) |
| GET | `/tasks/:id` | — | `Task` or 404 | Get specific task |
| POST | `/tasks/:id/claim` | `ClaimTask` | 200 + `Task` | Claim a pending task (must be online) |
| PATCH | `/tasks/:id` | `UpdateTask` | 200 + `Task` | Update task status/result |
| POST | `/tasks/:id/reject` | `ClaimTask` | 200 + `Task` | Reject claimed task (returns to pending) |
| POST | `/tasks/:id/retry` | `RetryTask` | 200 + `Task` | Retry failed task (increments retry_count) |
| GET | `/tasks/:id/routing-score` | — | `RoutingScore[]` | Diagnostic: routing scores for all agents |

### Event Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/events` | `PublishEvent` | 201 + `{event_id}` | Publish event (registered online agents only) |
| GET | `/events/stream` | — | SSE stream | Connect to event stream (`?agent_id=xxx`) |
| POST | `/heartbeat/:agentId` | — | 204 | Send heartbeat (restores offline agents) |

### Other Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/board` | System snapshot (agents + tasks) |
| GET | `/health` | Health check (includes memoryReady) |
| GET | `/memory/search` | Search shared memory (`?query=...&namespace=public&limit=10`) |
| GET | `/docs/onboarding` | This document |
| GET | `/docs/orchestrator-prompt` | Current orchestrator prompt |
| POST | `/webhooks/feishu` | Feishu webhook receiver (if configured) |

## Task Model

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| id | string | Auto-generated unique ID |
| title | string | Task title (1-256 chars) |
| description | string | Task details (max 4096 chars) |
| requiredCapabilities | string[] | Skills needed (min 1) |
| status | string | pending/claimed/working/done/failed |
| assignee | string/null | Currently assigned agent |
| createdBy | string | Who created this task |
| version | number | Optimistic concurrency version |

### Collaboration Fields (Optional)

| Field | Type | Description |
|-------|------|-------------|
| from_agent_id | string | Who requested this task |
| to_agent_id | string | Intended assignee (hint, not enforced by Gateway) |
| context_ref | string | `mem://` reference for shared context |
| artifacts | string[] | File paths or references |
| output_refs | string[] | Result references (set on completion) |

### Orchestration Fields (Optional)

| Field | Type | Description |
|-------|------|-------------|
| task_kind | string | Intent: plan, execute, verify, fix, review, explore |
| parent_task_id | string | Links to parent task for chains |
| run_id | string | Groups tasks in same workflow run |
| verification_required | boolean | Triggers verifier sub-task on completion |
| retry_count | number | Auto-incremented on retry (starts at 0) |

## Task Lifecycle

```
pending -> claimed -> working -> done/failed
             |                     |
             |               failed -> pending (retry, retry_count++)
             |
             +-> pending (reject — agent declines the task)
```

- Only the assigned agent can advance or reject a task past claimed
- Only registered online agents can claim tasks
- All transitions use optimistic concurrency via `version` field

### Auto Verify/Fix Loop

When a task has `verification_required: true` and completes:
1. Gateway auto-creates a `verify` sub-task (task_kind: "verify", parent_task_id: original)
2. If verify fails → Gateway auto-creates a `fix` sub-task
3. Fix completes → triggers re-verify
4. Max 2 fix cycles, then escalates (no more auto-fix)

## Event Format (SSE)

```
id: 7
event: task.assigned
data: {"task_id":"abc123","agent_id":"your-id","timestamp":"..."}
```

The server buffers the last 1000 events. On reconnect, send `Last-Event-ID` to replay.

## Memory Backend

- Search: `GET /memory/search?query=auth+refactor&namespace=public`
- Auto-write: Task completion automatically writes conclusions to `public/conclusions/` and process to `agent/{id}/`
- **Namespace isolation is convention-based (soft constraint), not a security boundary**
- Default local backend: run `npm run memory` on the host machine to expose `http://localhost:14242/mcp`
- Gateway health: `GET /health` returns `memoryReady: true` when the memory backend is connected; if the memory service is down, Gateway still starts in degraded mode with `memoryReady: false`
- Degraded mode behavior: `GET /memory/search` returns `503 Memory service unavailable` until `npm run memory` is started again
- The bundled memory MCP binds on `::`, but now uses an explicit host allow-list by default: `localhost,127.0.0.1`
- Override the allow-list with `HIVE_MEMORY_ALLOWED_HOSTS=host1,host2` when you intentionally need additional local/internal hostnames
- This is still a local/internal trust model, not full authentication. The allow-list narrows Host header acceptance; it does not replace real auth for internet-facing deployments

## Feishu Integration

Two paths available:

### Option 1: Lark CLI (Recommended)

The official `@larksuite/cli` provides full Feishu access with 19 skill domains:

```bash
# Install
npm install -g @larksuite/cli
npx skills add larksuite/cli --all -y

# Configure
npx @larksuite/cli config init  # enters App ID + Secret

# Use directly
npx @larksuite/cli base +record-list --params '{"app_token":"...","table_id":"..."}'
npx @larksuite/cli docs +doc-get --params '{"document_id":"..."}'
npx @larksuite/cli sheets +read --params '{"spreadsheet_token":"..."}'
npx @larksuite/cli event +subscribe  # WebSocket real-time events
```

Covers: base (bitable), sheets, docs, calendar, im, task, mail, contacts, wiki, events, and more.

### Option 2: Built-in feishu-mcp (Subset)

Standalone MCP Server with 4 tools: `read_bitable`, `write_bitable`, `read_doc`, `list_bitables`.
Limited scope, no sheet/doc write/event support.

### Webhook Events

`feishu.changed` SSE events are broadcast when `FEISHU_WEBHOOK_VERIFY_TOKEN` is configured. Supports AES-256-CBC encrypted payloads via `FEISHU_ENCRYPT_KEY`.

## Routing

Tasks are auto-assigned using multi-factor scoring:
- **Interest match**: +50 (agent listed the required capability in `interests`)
- **Capability match**: +20 (agent has the capability)
- **Load**: 0-30 (fewer active tasks = higher score)
- **Starvation boost**: +40 (idle > 60s with no active tasks)

Agents can also manually claim tasks via `POST /tasks/:id/claim`.
