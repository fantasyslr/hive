#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-}"
GATEWAY="${GATEWAY:-http://localhost:3000}"

if [[ -z "$ROLE" ]]; then
  echo "usage: bash scripts/start-worker-profile.sh <gemini|codex|claude>" >&2
  exit 2
fi

case "$ROLE" in
  gemini)
    export HIVE_AGENT_ID="${HIVE_AGENT_ID:-gemini-research}"
    export HIVE_AGENT_NAME="${HIVE_AGENT_NAME:-Gemini Research}"
    export HIVE_CAPABILITIES="${HIVE_CAPABILITIES:-research,design,frontend,marketing,writing}"
    export HIVE_INTERESTS="${HIVE_INTERESTS:-research,design,frontend,marketing}"
    export HIVE_AGENT_ENDPOINT="${HIVE_AGENT_ENDPOINT:-http://localhost:9102}"
    export HIVE_WORKER_COMMAND="${HIVE_WORKER_COMMAND:-bash scripts/worker-adapter.sh gemini}"
    ;;
  codex)
    export HIVE_AGENT_ID="${HIVE_AGENT_ID:-codex-exec}"
    export HIVE_AGENT_NAME="${HIVE_AGENT_NAME:-Codex Exec}"
    export HIVE_CAPABILITIES="${HIVE_CAPABILITIES:-coding,debug,review,implementation,execution}"
    export HIVE_INTERESTS="${HIVE_INTERESTS:-coding,debug,review,implementation}"
    export HIVE_AGENT_ENDPOINT="${HIVE_AGENT_ENDPOINT:-http://localhost:9103}"
    export HIVE_WORKER_COMMAND="${HIVE_WORKER_COMMAND:-bash scripts/worker-adapter.sh codex}"
    ;;
  claude)
    export HIVE_AGENT_ID="${HIVE_AGENT_ID:-claude-main}"
    export HIVE_AGENT_NAME="${HIVE_AGENT_NAME:-Claude Main}"
    export HIVE_CAPABILITIES="${HIVE_CAPABILITIES:-planning,summary,approval,orchestration}"
    export HIVE_INTERESTS="${HIVE_INTERESTS:-planning,approval,summary}"
    export HIVE_AGENT_ENDPOINT="${HIVE_AGENT_ENDPOINT:-http://localhost:9101}"
    export HIVE_WORKER_COMMAND="${HIVE_WORKER_COMMAND:-bash scripts/worker-adapter.sh claude}"
    ;;
  *)
    echo "unknown role: $ROLE" >&2
    exit 2
    ;;
esac

export GATEWAY
exec npm run worker:bridge
