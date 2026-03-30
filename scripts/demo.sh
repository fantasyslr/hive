#!/bin/bash
# Hive 最小演示路径
# 用法:
#   bash scripts/demo.sh
#   GATEWAY=http://主力机IP:3000 bash scripts/demo.sh --agent-id demo-agent --reset

set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:3000}"
AGENT_ID="demo-agent"
AGENT_NAME="Demo Agent"
CAPABILITIES="research,coding"
INTERESTS="planning"
ENDPOINT="http://localhost:9999"
RESET=0

usage() {
    echo "用法:"
    echo "  bash scripts/demo.sh"
    echo "  GATEWAY=http://主力机IP:3000 bash scripts/demo.sh --agent-id demo-agent --name 'Demo Agent' --reset"
    echo ""
    echo "参数:"
    echo "  --agent-id       demo agent ID（默认 demo-agent）"
    echo "  --name           demo agent 显示名（默认 Demo Agent）"
    echo "  --capabilities   demo agent capabilities（默认 research,coding）"
    echo "  --interests      demo agent interests（默认 planning）"
    echo "  --endpoint       demo agent endpoint（默认 http://localhost:9999）"
    echo "  --gateway        Gateway 地址（默认取 GATEWAY env 或 http://localhost:3000）"
    echo "  --reset          演示前先尝试删除同名 agent（忽略不存在）"
    echo "  -h, --help       显示帮助"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --agent-id)
            AGENT_ID="${2:-}"
            shift 2
            ;;
        --name)
            AGENT_NAME="${2:-}"
            shift 2
            ;;
        --capabilities)
            CAPABILITIES="${2:-}"
            shift 2
            ;;
        --interests)
            INTERESTS="${2:-}"
            shift 2
            ;;
        --endpoint)
            ENDPOINT="${2:-}"
            shift 2
            ;;
        --gateway)
            GATEWAY="${2:-}"
            shift 2
            ;;
        --reset)
            RESET=1
            shift
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
echo " Hive — 最小演示路径"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Gateway: $GATEWAY"
echo "Demo agent: $AGENT_ID"
echo ""

echo "→ 检查 Gateway 健康状态..."
HEALTH=$(curl -sf "$GATEWAY/health") || {
    echo "❌ 连不上 Gateway: $GATEWAY"
    echo "   先启动 npm run memory 和 npm start，再重试。"
    exit 1
}
python3 - <<'PY' "$HEALTH"
import json, sys
health = json.loads(sys.argv[1])
print(f"✓ Gateway online · status={health.get('status')} · memoryReady={health.get('memoryReady')}")
PY

if [ "$RESET" -eq 1 ]; then
    echo ""
    echo "→ 清理已有 demo agent（如果存在）..."
    curl -s -o /dev/null -X DELETE "$GATEWAY/agents/$AGENT_ID" || true
fi

echo ""
echo "→ 加入一个 demo agent..."
UNIQUE_CAPABILITY="demo-cap-${AGENT_ID}"
JOIN_CAPABILITIES="${CAPABILITIES},${UNIQUE_CAPABILITY}"
bash scripts/reset-demo.sh --gateway "$GATEWAY" --agent-id "$AGENT_ID" >/dev/null 2>&1 || true
bash scripts/join.sh \
  --gateway "$GATEWAY" \
  --agent-id "$AGENT_ID" \
  --name "$AGENT_NAME" \
  --capabilities "$JOIN_CAPABILITIES" \
  --interests "$INTERESTS" \
  --endpoint "$ENDPOINT"

echo ""
echo "→ 创建一个会自动分配给 demo agent 的任务..."
TASK=$(python3 - <<'PY' "$GATEWAY" "$AGENT_ID" "$UNIQUE_CAPABILITY"
import json, sys, urllib.request
base, agent_id, unique_capability = sys.argv[1:4]
payload = {
    "title": f"Demo task for {agent_id}",
    "description": "Created by scripts/demo.sh to show the minimum Hive collaboration path",
    "requiredCapabilities": [unique_capability],
    "createdBy": "demo-script",
    "from_agent_id": agent_id,
}
req = urllib.request.Request(
    f"{base}/tasks",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    print(resp.read().decode())
PY
)

echo "$TASK" | python3 -m json.tool 2>/dev/null || echo "$TASK"

echo ""
echo "→ 看看 board 现在是什么样..."
BOARD=$(curl -sf "$GATEWAY/board")
python3 - <<'PY' "$BOARD" "$AGENT_ID"
import json, sys
board = json.loads(sys.argv[1])
agent_id = sys.argv[2]
agents = board.get('agents', [])
tasks = board.get('tasks', [])
agent = next((a for a in agents if a.get('agent_id') == agent_id), None)
print(f"在线 agents: {len(agents)} · tasks: {len(tasks)}")
if agent:
    print(f"✓ Demo agent visible on board: {agent.get('agent_id')} ({agent.get('status')})")
assigned = [t for t in tasks if t.get('assignee') == agent_id]
if assigned:
    latest = assigned[-1]
    print(f"✓ Demo task visible on board: {latest.get('title')} · status={latest.get('status')}")
else:
    print("⚠ Board 上还没看到分配给 demo agent 的任务")
PY

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ 演示完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "你刚刚看到的是 Hive 的最小协作路径："
echo "  1. Gateway health 正常"
echo "  2. demo agent 成功加入"
echo "  3. board 能看到 agent 在线"
echo "  4. 新任务被自动分配给可处理它的 agent"
echo ""
echo "接下来如果想继续演示："
echo "  curl $GATEWAY/board"
echo "  curl -N $GATEWAY/events/stream?agent_id=$AGENT_ID"
echo ""
