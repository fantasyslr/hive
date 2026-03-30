#!/bin/bash
# 统一清理 Hive 试用/演示/烟测残留状态
# 用法:
#   bash scripts/cleanup-state.sh
#   bash scripts/cleanup-state.sh --demo-only
#   bash scripts/cleanup-state.sh --agent-id runner-agent

set -euo pipefail

LOCKDIR="/tmp/hive-cleanup-state.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "⚠ cleanup 已在运行，先等上一轮结束再重试"
  exit 1
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT

GATEWAY="${GATEWAY:-http://localhost:3000}"
TARGET_AGENT_ID=""
DEMO_ONLY=0
SMOKE_ONLY=0
RUNNER_ONLY=0

usage() {
  echo "用法:"
  echo "  bash scripts/cleanup-state.sh"
  echo "  bash scripts/cleanup-state.sh --demo-only"
  echo "  bash scripts/cleanup-state.sh --smoke-only"
  echo "  bash scripts/cleanup-state.sh --runner-only"
  echo "  bash scripts/cleanup-state.sh --agent-id runner-agent"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --agent-id)
      TARGET_AGENT_ID="${2:-}"
      shift 2
      ;;
    --demo-only)
      DEMO_ONLY=1
      shift
      ;;
    --smoke-only)
      SMOKE_ONLY=1
      shift
      ;;
    --runner-only)
      RUNNER_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "❌ 未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

HEALTH=$(curl -sf "$GATEWAY/health" 2>/dev/null) || {
  echo "❌ 连不上 Gateway: $GATEWAY"
  exit 1
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Hive — Cleanup State"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Gateway: $GATEWAY"
python3 - <<'PY' "$HEALTH"
import json, sys
health = json.loads(sys.argv[1])
print(f"✓ Gateway online · status={health.get('status')} · memoryReady={health.get('memoryReady')}")
PY

BOARD=$(curl -sf "$GATEWAY/board")

python3 - <<'PY' "$BOARD" "$TARGET_AGENT_ID" "$DEMO_ONLY" "$SMOKE_ONLY" "$RUNNER_ONLY" > /tmp/hive_cleanup_targets.json
import json, sys
board = json.loads(sys.argv[1])
target_agent = sys.argv[2]
demo_only = sys.argv[3] == '1'
smoke_only = sys.argv[4] == '1'
runner_only = sys.argv[5] == '1'

def include_agent(agent):
    agent_id = agent.get('agent_id', '')
    if target_agent:
        return agent_id == target_agent
    demo = agent_id.startswith('demo-agent')
    smoke = agent_id == 'smoke-1'
    runner = agent_id in {'runner-agent', 'usability-agent', 'usability-agent-2'}
    if demo_only:
        return demo
    if smoke_only:
        return smoke
    if runner_only:
        return runner
    return demo or smoke or runner

def include_task(task):
    title = task.get('title', '') or ''
    created_by = task.get('createdBy', '') or ''
    from_agent = task.get('from_agent_id', '') or ''
    assignee = task.get('assignee', '') or ''
    required = set(task.get('requiredCapabilities', []) or [])
    if target_agent:
        return target_agent in {from_agent, assignee} or target_agent in title or f'demo-cap-{target_agent}' in required
    demo = (
        created_by == 'demo-script'
        or from_agent.startswith('demo-agent')
        or title.startswith('Demo task')
        or any(x.startswith('demo-cap-') for x in required)
    )
    smoke = (
        assignee == 'smoke-1'
        or title in {'Smoke task', 'Manual task'}
        or (created_by == 'orchestrator' and set(task.get('requiredCapabilities', [])) in ({'test'}, {'rare'}))
    )
    runner = assignee in {'runner-agent', 'usability-agent', 'usability-agent-2'} or from_agent in {
        'runner-agent', 'usability-agent', 'usability-agent-2'
    }
    if demo_only:
        return demo
    if smoke_only:
        return smoke
    if runner_only:
        return runner
    return demo or smoke or runner

agents = [a['agent_id'] for a in board.get('agents', []) if include_agent(a)]
tasks = [
    {
        'id': t['id'],
        'title': t.get('title', ''),
        'assignee': t.get('assignee'),
        'status': t.get('status'),
    }
    for t in board.get('tasks', []) if include_task(t)
]
print(json.dumps({'agents': agents, 'tasks': tasks}, ensure_ascii=False))
PY

python3 - <<'PY' /tmp/hive_cleanup_targets.json
import json, sys
payload = json.load(open(sys.argv[1]))
print(f"→ 准备删除 agents: {len(payload['agents'])}")
for item in payload['agents']:
    print(f"  - {item}")
print(f"→ 准备删除 tasks: {len(payload['tasks'])}")
for item in payload['tasks'][:20]:
    print(f"  - {item['title']} [{item['id']}] status={item['status']} assignee={item['assignee']}")
if len(payload['tasks']) > 20:
    print(f"  ... and {len(payload['tasks']) - 20} more")
PY

python3 - <<'PY' /tmp/hive_cleanup_targets.json > /tmp/hive_cleanup_task_ids.txt
import json, sys
payload = json.load(open(sys.argv[1]))
for task in payload['tasks']:
    print(task['id'])
PY

python3 - <<'PY' /tmp/hive_cleanup_targets.json > /tmp/hive_cleanup_agent_ids.txt
import json, sys
payload = json.load(open(sys.argv[1]))
for agent in payload['agents']:
    print(agent)
PY

echo ""
echo "→ 删除 tasks..."
while IFS= read -r task_id; do
  [ -n "$task_id" ] || continue
  status=$(curl -s -o /tmp/hive_cleanup_task_resp.txt -w '%{http_code}' -X DELETE "$GATEWAY/tasks/$task_id")
  if [ "$status" = "200" ]; then
    echo "✓ deleted task: $task_id"
  elif [ "$status" = "404" ]; then
    echo "○ task already gone: $task_id"
  else
    echo "⚠ failed deleting task: $task_id (HTTP $status)"
    cat /tmp/hive_cleanup_task_resp.txt
  fi
done < /tmp/hive_cleanup_task_ids.txt

echo ""
echo "→ 删除 agents..."
while IFS= read -r agent_id; do
  [ -n "$agent_id" ] || continue
  status=$(curl -s -o /tmp/hive_cleanup_agent_resp.txt -w '%{http_code}' -X DELETE "$GATEWAY/agents/$agent_id")
  if [ "$status" = "204" ]; then
    echo "✓ deleted agent: $agent_id"
  elif [ "$status" = "404" ]; then
    echo "○ agent already gone: $agent_id"
  else
    echo "⚠ failed deleting agent: $agent_id (HTTP $status)"
    cat /tmp/hive_cleanup_agent_resp.txt
  fi
done < /tmp/hive_cleanup_agent_ids.txt

echo ""
echo "→ 当前 board 摘要..."
python3 - <<'PY' "$GATEWAY"
import json, urllib.request, sys
board = json.load(urllib.request.urlopen(f"{sys.argv[1]}/board"))
counts = {}
for task in board['tasks']:
    counts[task['status']] = counts.get(task['status'], 0) + 1
print(json.dumps({
  'online_agents': [a['agent_id'] for a in board['agents'] if a['status']=='online'],
  'task_counts': counts,
}, ensure_ascii=False, indent=2))
PY
