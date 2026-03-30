#!/bin/bash
# 清理 Hive 演示遗留的 demo agent / demo task
# 用法:
#   bash scripts/reset-demo.sh
#   bash scripts/reset-demo.sh --agent-id demo-agent-s03b

set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:3000}"
TARGET_AGENT_ID=""

usage() {
    echo "用法:"
    echo "  bash scripts/reset-demo.sh"
    echo "  GATEWAY=http://主力机IP:3000 bash scripts/reset-demo.sh --agent-id demo-agent-s03b"
    echo ""
    echo "参数:"
    echo "  --agent-id     只清理指定 demo agent"
    echo "  --gateway      Gateway 地址（默认取 GATEWAY env 或 http://localhost:3000）"
    echo "  -h, --help     显示帮助"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --agent-id)
            TARGET_AGENT_ID="${2:-}"
            shift 2
            ;;
        --gateway)
            GATEWAY="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "❌ 未知参数: $1"
            echo ""
            usage
            exit 1
            ;;
    esac
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Hive — 清理演示遗留状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Gateway: $GATEWAY"
echo ""

echo "→ 检查 Gateway 健康状态..."
HEALTH=$(curl -sf "$GATEWAY/health") || {
    echo "❌ 连不上 Gateway: $GATEWAY"
    exit 1
}
python3 - <<'PY' "$HEALTH"
import json, sys
health = json.loads(sys.argv[1])
print(f"✓ Gateway online · status={health.get('status')} · memoryReady={health.get('memoryReady')}")
PY

echo ""
echo "→ 读取当前 board..."
BOARD=$(curl -sf "$GATEWAY/board")

python3 - <<'PY' "$BOARD" "$TARGET_AGENT_ID" > /tmp/hive_reset_agents.txt
import json, sys
board = json.loads(sys.argv[1])
target = sys.argv[2]
agents = []
for agent in board.get('agents', []):
    agent_id = agent.get('agent_id', '')
    if target:
        if agent_id == target:
            agents.append(agent_id)
    else:
        if agent_id.startswith('demo-agent'):
            agents.append(agent_id)
for item in agents:
    print(item)
PY

python3 - <<'PY' "$BOARD" "$TARGET_AGENT_ID" > /tmp/hive_reset_tasks.txt
import json, sys
board = json.loads(sys.argv[1])
target = sys.argv[2]
tasks = []
for task in board.get('tasks', []):
    title = task.get('title', '') or ''
    created_by = task.get('createdBy', '') or ''
    from_agent = task.get('from_agent_id', '') or ''
    assignee = task.get('assignee', '') or ''
    task_id = task.get('id', '')
    if target:
        if target in [from_agent, assignee] or target in title:
            tasks.append((task_id, title, assignee))
    else:
        if created_by == 'demo-script' or from_agent.startswith('demo-agent') or title.startswith('Demo task'):
            tasks.append((task_id, title, assignee))
for task_id, title, assignee in tasks:
    print(f"{task_id}\t{title}\t{assignee}")
PY

if [ ! -s /tmp/hive_reset_agents.txt ] && [ ! -s /tmp/hive_reset_tasks.txt ]; then
    echo "✓ 没有发现需要清理的 demo agent 或 demo task"
    exit 0
fi

if [ -s /tmp/hive_reset_agents.txt ]; then
    echo "→ 准备清理这些 demo agent:"
    cat /tmp/hive_reset_agents.txt | sed 's/^/  - /'
else
    echo "→ 没有发现需要清理的 demo agent"
fi

if [ -s /tmp/hive_reset_tasks.txt ]; then
    echo "→ 当前 board 上与 demo 相关的 task："
    awk -F '\t' '{printf "  - %s [%s] assignee=%s\n", $2, $1, $3}' /tmp/hive_reset_tasks.txt
else
    echo "→ 没有发现 demo task"
fi

if [ -s /tmp/hive_reset_tasks.txt ]; then
    echo ""
    echo "→ 删除 demo task..."
    while IFS=$'\t' read -r task_id task_title task_assignee; do
        [ -z "$task_id" ] && continue
        status=$(curl -s -o /tmp/hive_reset_delete_task_resp.txt -w '%{http_code}' -X DELETE "$GATEWAY/tasks/$task_id")
        if [ "$status" = "200" ]; then
            echo "✓ 已删除 task: $task_title [$task_id]"
        elif [ "$status" = "404" ]; then
            echo "○ task 已不存在，跳过: $task_title [$task_id]"
        else
            echo "⚠ 删除 task 失败: $task_title [$task_id] (HTTP $status)"
            cat /tmp/hive_reset_delete_task_resp.txt
        fi
    done < /tmp/hive_reset_tasks.txt
fi

if [ -s /tmp/hive_reset_agents.txt ]; then
    echo ""
    echo "→ 删除 demo agent..."
    while IFS= read -r agent_id; do
        [ -z "$agent_id" ] && continue
        status=$(curl -s -o /tmp/hive_reset_delete_resp.txt -w '%{http_code}' -X DELETE "$GATEWAY/agents/$agent_id")
        if [ "$status" = "204" ]; then
            echo "✓ 已删除 agent: $agent_id"
        elif [ "$status" = "404" ]; then
            echo "○ agent 已不存在，跳过: $agent_id"
        else
            echo "⚠ 删除 agent 失败: $agent_id (HTTP $status)"
            cat /tmp/hive_reset_delete_resp.txt
        fi
    done < /tmp/hive_reset_agents.txt
fi

echo ""
echo "→ 重新检查 board 中的 demo agent 状态..."
NEW_BOARD=$(curl -sf "$GATEWAY/board")
python3 - <<'PY' "$NEW_BOARD" "$TARGET_AGENT_ID"
import json, sys
board = json.loads(sys.argv[1])
target = sys.argv[2]
remaining = []
for agent in board.get('agents', []):
    agent_id = agent.get('agent_id', '')
    if target:
        if agent_id == target:
            remaining.append(agent_id)
    else:
        if agent_id.startswith('demo-agent'):
            remaining.append(agent_id)
if remaining:
    print("⚠ 仍存在这些 demo agent:")
    for agent_id in remaining:
        print(f"  - {agent_id}")
else:
    print("✓ demo agent 已清理完成")
PY

python3 - <<'PY' "$NEW_BOARD" "$TARGET_AGENT_ID"
import json, sys
board = json.loads(sys.argv[1])
target = sys.argv[2]
remaining = []
for task in board.get('tasks', []):
    title = task.get('title', '') or ''
    created_by = task.get('createdBy', '') or ''
    from_agent = task.get('from_agent_id', '') or ''
    assignee = task.get('assignee', '') or ''
    task_id = task.get('id', '')
    if target:
        if target in [from_agent, assignee] or target in title:
            remaining.append((task_id, title))
    else:
        if created_by == 'demo-script' or from_agent.startswith('demo-agent') or title.startswith('Demo task'):
            remaining.append((task_id, title))
if remaining:
    print("⚠ 仍存在这些 demo task:")
    for task_id, title in remaining:
        print(f"  - {title} [{task_id}]")
else:
    print("✓ demo task 已清理完成")
PY

echo ""
echo "说明："
echo "- 当前脚本会删除 demo agent 和 demo task"
echo "- 如果仍有残留，优先检查 board 输出和对应 HTTP 错误"
