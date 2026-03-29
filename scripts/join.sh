#!/bin/bash
# 团队成员一键加入 Hive
# 用法: GATEWAY=http://192.168.1.x:3000 bash join.sh

set -e

GATEWAY="${GATEWAY:-http://localhost:3000}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Hive — 加入协作网络"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Gateway: $GATEWAY"
echo ""

# 收集信息
read -p "你的 Agent ID（如 liren-claude-main）: " AGENT_ID
read -p "显示名（如 Liren 主控）: " AGENT_NAME
read -p "你能做什么？用逗号分隔（如 planning,coding,data）: " CAPS_RAW
read -p "你想做什么？用逗号分隔，可为空: " INTERESTS_RAW
read -p "你的回调地址（如 http://192.168.1.5:4000，没有就填 http://localhost:9999）: " ENDPOINT

# 格式化
CAPS=$(echo "$CAPS_RAW" | sed 's/,/","/g')
INTERESTS=$(echo "$INTERESTS_RAW" | sed 's/,/","/g')
[ -z "$INTERESTS_RAW" ] && INTERESTS_JSON="[]" || INTERESTS_JSON="[\"$INTERESTS\"]"

echo ""
echo "→ 注册到 Gateway..."

RESULT=$(curl -sf -X POST "$GATEWAY/agents" \
  -H 'Content-Type: application/json' \
  -d "{
    \"agent_id\": \"$AGENT_ID\",
    \"name\": \"$AGENT_NAME\",
    \"capabilities\": [\"$CAPS\"],
    \"interests\": $INTERESTS_JSON,
    \"endpoint\": \"$ENDPOINT\"
  }" 2>&1) || {
    echo "❌ 注册失败 — Gateway 是否在运行？地址是否正确？"
    echo "   尝试: curl $GATEWAY/health"
    exit 1
}

echo "✓ 注册成功！"
echo ""
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ 你已加入 Hive！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "接下来让你的 CLI agent 做这些事："
echo ""
echo "  连接事件流:"
echo "  curl -N $GATEWAY/events/stream?agent_id=$AGENT_ID"
echo ""
echo "  保持心跳（每 15 秒）:"
echo "  curl -X POST $GATEWAY/heartbeat/$AGENT_ID"
echo ""
echo "  看工作看板:"
echo "  curl $GATEWAY/board"
echo ""
echo "  完整 API 文档:"
echo "  curl $GATEWAY/docs/onboarding"
echo ""
