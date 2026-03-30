#!/bin/bash
# 团队成员一键加入 Hive
# 用法:
#   GATEWAY=http://192.168.1.x:3000 bash scripts/join.sh
#   bash scripts/join.sh --agent-id demo-agent --name "Demo Agent" --capabilities research,coding --endpoint http://localhost:9999

set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:3000}"
AGENT_ID=""
AGENT_NAME=""
CAPS_RAW=""
INTERESTS_RAW=""
ENDPOINT=""

usage() {
    echo "用法:"
    echo "  GATEWAY=http://主力机IP:3000 bash scripts/join.sh"
    echo "  bash scripts/join.sh --agent-id demo-agent --name 'Demo Agent' --capabilities research,coding --interests planning --endpoint http://localhost:9999"
    echo ""
    echo "参数:"
    echo "  --agent-id       Agent ID（必填，可交互输入）"
    echo "  --name           显示名（必填，可交互输入）"
    echo "  --capabilities   能力列表，逗号分隔（必填，可交互输入）"
    echo "  --interests      兴趣列表，逗号分隔（可选）"
    echo "  --endpoint       回调地址（默认 http://localhost:9999）"
    echo "  --gateway        Gateway 地址（默认取 GATEWAY env 或 http://localhost:3000）"
    echo "  -h, --help       显示帮助"
}

trim_csv() {
    printf '%s' "$1" | awk -F',' '
      {
        first = 1;
        for (i = 1; i <= NF; i++) {
          gsub(/^[ \t]+|[ \t]+$/, "", $i);
          if ($i != "") {
            if (!first) printf ",";
            printf "%s", $i;
            first = 0;
          }
        }
      }
    '
}

csv_to_json_array() {
    local raw
    raw="$(trim_csv "$1")"
    if [ -z "$raw" ]; then
        printf '[]'
        return
    fi

    python3 - <<'PY' "$raw"
import json, sys
items = [x.strip() for x in sys.argv[1].split(',') if x.strip()]
print(json.dumps(items, ensure_ascii=False))
PY
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
            CAPS_RAW="${2:-}"
            shift 2
            ;;
        --interests)
            INTERESTS_RAW="${2:-}"
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
echo " Hive — 加入协作网络"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Gateway: $GATEWAY"
echo ""

echo "→ 检查 Gateway 健康状态..."
HEALTH=$(curl -sf "$GATEWAY/health" 2>/dev/null) || {
    echo "❌ 连不上 Gateway: $GATEWAY"
    echo "   先确认 Gateway 已启动，再重试。"
    echo "   可手动检查: curl $GATEWAY/health"
    exit 1
}

python3 - <<'PY' "$HEALTH"
import json, sys
raw = sys.argv[1]
try:
    data = json.loads(raw)
except Exception:
    print(raw)
    raise SystemExit(0)
status = data.get("status", "unknown")
memory_ready = data.get("memoryReady")
print(f"✓ Gateway online · status={status} · memoryReady={memory_ready}")
if memory_ready is False:
    print("  提醒：memoryReady=false，说明 Gateway 处于 degraded mode，但你仍然可以先注册。")
PY

if [ -z "$AGENT_ID" ]; then
    read -r -p "你的 Agent ID（如 liren-claude-main）: " AGENT_ID
fi
if [ -z "$AGENT_NAME" ]; then
    read -r -p "显示名（如 Liren 主控）: " AGENT_NAME
fi
if [ -z "$CAPS_RAW" ]; then
    read -r -p "你能做什么？用逗号分隔（如 planning,coding,data）: " CAPS_RAW
fi
if [ -z "$INTERESTS_RAW" ] && [ -t 0 ]; then
    read -r -p "你想做什么？用逗号分隔，可为空: " INTERESTS_RAW
fi
if [ -z "$ENDPOINT" ] && [ -t 0 ]; then
    read -r -p "你的回调地址（默认 http://localhost:9999）: " ENDPOINT
fi

ENDPOINT="${ENDPOINT:-http://localhost:9999}"
INTERESTS_RAW="${INTERESTS_RAW:-}"
CAPS_RAW="$(trim_csv "$CAPS_RAW")"
INTERESTS_RAW="$(trim_csv "$INTERESTS_RAW")"

if [ -z "$AGENT_ID" ] || [ -z "$AGENT_NAME" ] || [ -z "$CAPS_RAW" ]; then
    echo "❌ Agent ID / 显示名 / capabilities 不能为空"
    exit 1
fi

CAPS_JSON="$(csv_to_json_array "$CAPS_RAW")"
INTERESTS_JSON="$(csv_to_json_array "$INTERESTS_RAW")"

echo ""
echo "→ 注册到 Gateway..."

PAYLOAD=$(python3 - <<'PY' "$AGENT_ID" "$AGENT_NAME" "$CAPS_JSON" "$INTERESTS_JSON" "$ENDPOINT"
import json, sys
agent_id, name, caps_json, interests_json, endpoint = sys.argv[1:6]
payload = {
    "agent_id": agent_id,
    "name": name,
    "capabilities": json.loads(caps_json),
    "interests": json.loads(interests_json),
    "endpoint": endpoint,
}
print(json.dumps(payload, ensure_ascii=False))
PY
)

RESULT=$(curl -sf -X POST "$GATEWAY/agents" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" 2>&1) || {
    echo "❌ 注册失败"
    echo "   请先确认 Gateway 地址、字段格式和 endpoint 是否正确。"
    echo "   可手动检查: curl $GATEWAY/health"
    exit 1
}

echo "✓ 注册成功"
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

echo ""
echo "→ 检查你是否已经出现在 Board..."
BOARD=$(curl -sf "$GATEWAY/board" 2>/dev/null) || {
    echo "⚠ 读取 board 失败，但注册已经成功。"
    echo "   你仍然可以手动检查: curl $GATEWAY/board"
    BOARD=""
}

if [ -n "$BOARD" ] && python3 - <<'PY' "$AGENT_ID" "$BOARD"
import json, sys
agent_id = sys.argv[1]
board = json.loads(sys.argv[2])
for agent in board.get("agents", []):
    if agent.get("agent_id") == agent_id:
        print(f"✓ Board 已看到你在线: {agent.get('agent_id')} ({agent.get('status')})")
        raise SystemExit(0)
raise SystemExit(1)
PY
then
    :
else
    echo "⚠ 已注册，但还没在 board 中确认到你的状态。"
    echo "   你可以手动检查: curl $GATEWAY/board"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ 你已加入 Hive！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "接下来最常用的命令："
echo ""
echo "  看工作看板:"
echo "  curl $GATEWAY/board"
echo ""
echo "  连接事件流:"
echo "  curl -N $GATEWAY/events/stream?agent_id=$AGENT_ID"
echo ""
echo "  保持心跳（每 15 秒一次）:"
echo "  curl -X POST $GATEWAY/heartbeat/$AGENT_ID"
echo ""
echo "  临时 keepalive（一条命令先跑起来）:"
echo "  while true; do curl -sf -X POST $GATEWAY/heartbeat/$AGENT_ID >/dev/null || break; sleep 15; done"
echo ""
echo "  连接事件流并观察系统广播:"
echo "  curl -N $GATEWAY/events/stream?agent_id=$AGENT_ID"
echo ""
echo "  完整 API 文档:"
echo "  curl $GATEWAY/docs/onboarding"
echo ""
echo "  如果你只是想先确认接入状态:"
echo "  curl $GATEWAY/health"
echo ""
