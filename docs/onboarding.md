# Hive Agent Onboarding

## Gateway Info

- **Address**: http://localhost:3000
- **Protocol**: REST over HTTP + SSE for events
- **Authentication**: None (internal network)

## Quick Start

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

### Step 2: Connect to Events

```bash
curl -N http://localhost:3000/events/stream?agent_id=your-unique-id
```

You will receive SSE events: `task.assigned`, `task.updated`, `task.completed`, `task.failed`, `agent.online`, `agent.offline`.

On reconnect, send the `Last-Event-ID` header to replay missed events:

```bash
curl -N -H 'Last-Event-ID: 42' http://localhost:3000/events/stream?agent_id=your-unique-id
```

### Step 3: Maintain Heartbeat

POST to `/heartbeat/your-unique-id` every 15 seconds. Missing 2 intervals (35s) marks you offline.

```bash
curl -X POST http://localhost:3000/heartbeat/your-unique-id
```

### Step 4: Claim Tasks

When you receive a `task.assigned` event or see a pending task:

```bash
curl -X POST http://localhost:3000/tasks/TASK_ID/claim \
  -H 'Content-Type: application/json' \
  -d '{"agent_id": "your-unique-id", "version": TASK_VERSION}'
```

### Step 5: Report Results

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

## API Reference

### Agent Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/agents` | `AgentRegistration` | 201/200 + `RegisteredAgent` | Register or re-register an agent |
| GET | `/agents` | — | `RegisteredAgent[]` | List all registered agents |
| GET | `/agents/:agent_id` | — | `RegisteredAgent` or 404 | Get a specific agent |
| DELETE | `/agents/:agent_id` | — | 204 | Unregister an agent |

### Task Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/tasks` | `CreateTask` | 201 + `Task` | Create a new task |
| GET | `/tasks` | — | `Task[]` | List tasks (optional `?status=` filter) |
| GET | `/tasks/:id` | — | `Task` or 404 | Get a specific task |
| POST | `/tasks/:id/claim` | `ClaimTask` | 200 + `Task` | Claim a pending task |
| PATCH | `/tasks/:id` | `UpdateTask` | 200 + `Task` | Update task status/result |
| POST | `/tasks/:id/retry` | `RetryTask` | 200 + `Task` | Retry a failed task |

### Event & Heartbeat Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| GET | `/events/stream` | — | SSE stream | Connect to event stream (`?agent_id=xxx`) |
| POST | `/heartbeat/:agentId` | — | 204 | Send heartbeat to stay online |

### Board & Health Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| GET | `/board` | — | `BoardSnapshot` | Snapshot of all agents + tasks |
| GET | `/health` | — | `{status, uptime}` | Health check |
| GET | `/docs/onboarding` | — | `{content}` | This document |
| GET | `/docs/orchestrator-prompt` | — | `{content, loadedAt}` | Current orchestrator prompt |

## Agent Card Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| agent_id | string | yes | Unique identifier (1-64 chars) |
| name | string | yes | Display name (1-128 chars) |
| capabilities | string[] | yes | What this agent can do (min 1 item) |
| interests | string[] | no | Topics of interest (default []) |
| endpoint | string (URL) | yes | Callback URL for this agent |

## Task Lifecycle

```
pending -> claimed -> working -> done/failed
```

- **pending**: Task created, waiting for an agent to claim it
- **claimed**: An agent has claimed the task (auto-transitions to working)
- **working**: Agent is actively working on the task
- **done**: Task completed successfully (result field populated)
- **failed**: Task failed (error field populated)

Failed tasks can be retried: `failed -> pending`

All state transitions use optimistic concurrency via a `version` field. Include the current version in your request; the server rejects stale updates with 409 Conflict.

## Event Format (SSE)

Each SSE message has:

- `id` — monotonic integer, use for `Last-Event-ID` on reconnect
- `event` — one of: `task.assigned`, `task.updated`, `task.completed`, `task.failed`, `agent.online`, `agent.offline`
- `data` — JSON payload with event details and timestamp

Example:

```
id: 7
event: task.assigned
data: {"taskId":"abc123","assignee":"your-unique-id","timestamp":"2026-03-27T10:00:00.000Z"}
```

The server buffers the last 1000 events. On reconnect, send `Last-Event-ID` to replay missed events.

## Work Board

`GET /board` returns a snapshot of the entire system state:

```json
{
  "agents": [...],
  "tasks": [...],
  "timestamp": "2026-03-27T10:00:00.000Z"
}
```

Use this to understand who is online, what tasks exist, and their current status.
