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

echo "--- Double claim with stale version (expect 409) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/tasks/$TASK2_ID/claim" -H 'Content-Type: application/json' \
  -d "{\"agent_id\":\"smoke-1\",\"version\":$TASK2_VER}")
echo "Double claim status: $HTTP_CODE (expect 409)"
[ "$HTTP_CODE" = "409" ] || { echo "FAIL: expected 409, got $HTTP_CODE"; exit 1; }

echo "--- Board ---"
curl -sf $BASE/board | head -c 500
echo ""

echo "--- Health ---"
curl -sf $BASE/health
echo ""

echo ""
echo "=== Interest-First Routing Tests ==="

echo "--- Register interest-agent (interests: data-analysis) ---"
curl -sf -X POST $BASE/agents -H 'Content-Type: application/json' \
  -d '{"agent_id":"interest-agent","name":"Interest Agent","capabilities":["research"],"interests":["data-analysis"],"endpoint":"http://localhost:9998"}'
echo ""

echo "--- Register generic-agent (no interests) ---"
curl -sf -X POST $BASE/agents -H 'Content-Type: application/json' \
  -d '{"agent_id":"generic-agent","name":"Generic Agent","capabilities":["research"],"interests":[],"endpoint":"http://localhost:9997"}'
echo ""

echo "--- Create task with data-analysis in title (should go to interest-agent) ---"
TASK3=$(curl -sf -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Run data-analysis report","description":"Weekly metrics","requiredCapabilities":["research"],"createdBy":"orchestrator"}')
echo "$TASK3"
ASSIGNED=$(echo "$TASK3" | grep -o '"autoAssignedTo":"[^"]*"' | cut -d'"' -f4)
echo "Assigned to: $ASSIGNED"
[ "$ASSIGNED" = "interest-agent" ] || { echo "FAIL: expected interest-agent, got $ASSIGNED"; exit 1; }

echo "--- Create unrelated task (fallback — should still assign) ---"
TASK4=$(curl -sf -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Unrelated work","description":"general task","requiredCapabilities":["research"],"createdBy":"orchestrator"}')
echo "$TASK4"
ASSIGNED4=$(echo "$TASK4" | grep -o '"autoAssignedTo":"[^"]*"' | cut -d'"' -f4)
echo "Assigned to: $ASSIGNED4 (any agent is fine, just not empty)"
[ -n "$ASSIGNED4" ] || { echo "FAIL: unrelated task not assigned to any agent"; exit 1; }

echo "--- Create a third task to verify starvation-eligible routing works ---"
TASK5=$(curl -sf -X POST $BASE/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Another research job","description":"more work","requiredCapabilities":["research"],"createdBy":"orchestrator"}')
echo "$TASK5"
ASSIGNED5=$(echo "$TASK5" | grep -o '"autoAssignedTo":"[^"]*"' | cut -d'"' -f4)
echo "Assigned to: $ASSIGNED5 (assignment works)"
[ -n "$ASSIGNED5" ] || { echo "FAIL: third task not assigned"; exit 1; }

echo ""
echo "SMOKE TEST PASSED"
