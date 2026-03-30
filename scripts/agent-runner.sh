#!/bin/bash
# Hive 最小常驻 agent runner
# 一条命令完成：注册 -> SSE -> heartbeat
# 用法:
#   GATEWAY=http://localhost:3000 bash scripts/agent-runner.sh --agent-id my-agent --name 'My Agent' --capabilities research,coding

set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:3000}"
AGENT_ID=""
AGENT_NAME=""
CAPS_RAW=""
INTERESTS_RAW=""
ENDPOINT="http://localhost:9999"
HEARTBEAT_INTERVAL=15

usage() {
    echo "用法:"
    echo "  GATEWAY=http://主力机IP:3000 bash scripts/agent-runner.sh --agent-id my-agent --name 'My Agent' --capabilities research,coding"
    echo ""
    echo "参数:"
    echo "  --agent-id       Agent ID（必填）"
    echo "  --name           显示名（必填）"
    echo "  --capabilities   能力列表，逗号分隔（必填）"
    echo "  --interests      兴趣列表，逗号分隔（可选）"
    echo "  --endpoint       回调地址（默认 http://localhost:9999）"
    echo "  --gateway        Gateway 地址（默认取 GATEWAY env 或 http://localhost:3000）"
    echo "  --heartbeat-sec  心跳间隔秒数（默认 15）"
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
        --heartbeat-sec)
            HEARTBEAT_INTERVAL="${2:-}"
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

CAPS_RAW="$(trim_csv "$CAPS_RAW")"
INTERESTS_RAW="$(trim_csv "$INTERESTS_RAW")"

if [ -z "$AGENT_ID" ] || [ -z "$AGENT_NAME" ] || [ -z "$CAPS_RAW" ]; then
    echo "❌ Agent ID / 显示名 / capabilities 不能为空"
    usage
    exit 1
fi

CAPS_JSON="$(csv_to_json_array "$CAPS_RAW")"
INTERESTS_JSON="$(csv_to_json_array "$INTERESTS_RAW")"

cleanup() {
    if [ -n "${HB_PID:-}" ] && kill -0 "$HB_PID" 2>/dev/null; then
        kill "$HB_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Hive — Agent Runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Gateway: $GATEWAY"
echo "Agent: $AGENT_ID"
echo ""

echo "→ 检查 Gateway 健康状态..."
HEALTH=$(curl -sf "$GATEWAY/health" 2>/dev/null) || {
    echo "❌ 连不上 Gateway: $GATEWAY"
    exit 1
}
python3 - <<'PY' "$HEALTH"
import json, sys
raw = sys.argv[1]
data = json.loads(raw)
print(f"✓ Gateway online · status={data.get('status')} · memoryReady={data.get('memoryReady')}")
PY

echo ""
echo "→ 注册 agent..."
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

curl -sf -X POST "$GATEWAY/agents" -H 'Content-Type: application/json' -d "$PAYLOAD" >/dev/null
printf '✓ 已注册: %s\n' "$AGENT_ID"

echo "→ 启动 heartbeat loop..."
(
  while true; do
    curl -sf -X POST "$GATEWAY/heartbeat/$AGENT_ID" >/dev/null || exit 1
    sleep "$HEARTBEAT_INTERVAL"
  done
) &
HB_PID=$!
printf '✓ Heartbeat loop started (pid=%s, every %ss)\n' "$HB_PID" "$HEARTBEAT_INTERVAL"

echo ""
echo "→ 连接 SSE 事件流（Ctrl+C 退出）..."
echo ""
exec curl -N -sf "$GATEWAY/events/stream?agent_id=$AGENT_ID"
