#!/bin/bash
set -e
BASE=http://localhost:3000

echo "--- Register agent ---"
curl -sf -X POST $BASE/agents -H 'Content-Type: application/json' \
  -d '{"agent_id":"smoke-1","name":"Smoke Agent","capabilities":["test"],"interests":[],"endpoint":"http://localhost:9999"}'
echo ""

echo "--- Create task (auto-assigned to smoke-1) ---"
TASK=$(curl -sf -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Smoke task","description":"test","requiredCapabilities":["test"],"createdBy":"orchestrator"}')
echo "$TASK"
TASK_ID=$(echo "$TASK" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Task ID: $TASK_ID (auto-assigned)"

echo "--- Create unmatched task (no agent has 'rare' capability) ---"
TASK2=$(curl -sf -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Manual task","description":"test","requiredCapabilities":["rare"],"createdBy":"orchestrator"}')
echo "$TASK2"
TASK2_ID=$(echo "$TASK2" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
TASK2_VER=$(echo "$TASK2" | grep -o '"version":[0-9]*' | head -1 | cut -d: -f2)
echo "Task2 ID: $TASK2_ID, Version: $TASK2_VER (pending)"

echo "--- Claim unmatched task ---"
curl -sf -X POST "$BASE/tasks/$TASK2_ID/claim" -H 'Content-Type: application/json' \
  -d "{\"agent_id\":\"smoke-1\",\"version\":$TASK2_VER}"
echo ""

echo "--- Double claim (expect 409 or 422) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/tasks/$TASK2_ID/claim" -H 'Content-Type: application/json' \
  -d "{\"agent_id\":\"smoke-2\",\"version\":$TASK2_VER}")
echo "Double claim status: $HTTP_CODE (expect 409 or 422)"
[ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "422" ] || { echo "FAIL: expected 409 or 422, got $HTTP_CODE"; exit 1; }

echo "--- Board ---"
curl -sf $BASE/board | head -c 500
echo ""

echo "--- Health ---"
curl -sf $BASE/health
echo ""

echo "SMOKE TEST PASSED"
