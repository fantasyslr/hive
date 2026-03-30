#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-}"
TASK_JSON="${HIVE_TASK_JSON:-}"
TASK_TITLE="${HIVE_TASK_TITLE:-}"
TASK_DESCRIPTION="${HIVE_TASK_DESCRIPTION:-}"
TASK_ID="${HIVE_TASK_ID:-}"

if [[ -z "$ROLE" ]]; then
  echo "usage: bash scripts/worker-adapter.sh <gemini|codex|claude>" >&2
  exit 2
fi

if [[ -z "$TASK_JSON" ]]; then
  echo "HIVE_TASK_JSON is required" >&2
  exit 2
fi

PROMPT_HEADER="你现在在 Hive 自动 worker 里执行任务。\n\n任务 ID: $TASK_ID\n标题: $TASK_TITLE\n描述: $TASK_DESCRIPTION\n\n完整任务 JSON:\n$TASK_JSON\n"

case "$ROLE" in
  gemini)
    exec_cmd="${HIVE_GEMINI_EXEC_COMMAND:-}"
    role_prompt="你是 gemini-research。只处理 research / design / frontend direction / marketing / copywriting / positioning 类任务。输出中文大白话，先给结论，再给理由，再给建议。不要输出多余寒暄。"
    ;;
  codex)
    exec_cmd="${HIVE_CODEX_EXEC_COMMAND:-}"
    role_prompt="你是 codex-exec。只处理 coding / debug / implementation / review / command execution 类任务。输出中文，先给结果，再给证据，再给风险。不要寒暄。"
    ;;
  claude)
    exec_cmd="${HIVE_CLAUDE_EXEC_COMMAND:-}"
    role_prompt="你是 claude-main。只处理 planning / orchestration / approval / summary 类任务。用中文大白话输出。"
    ;;
  *)
    echo "unknown role: $ROLE" >&2
    exit 2
    ;;
esac

if [[ -z "$exec_cmd" ]]; then
  echo "No exec command configured for role=$ROLE" >&2
  echo "Set HIVE_${ROLE^^}_EXEC_COMMAND or explicit environment variable." >&2
  exit 2
fi

full_prompt="$PROMPT_HEADER\n$role_prompt\n\n请直接完成任务，并只输出最终结果正文。"
export FULL_PROMPT="$full_prompt"

escaped_prompt=$(python3 - <<'PY'
import json, os
print(json.dumps(os.environ['FULL_PROMPT']))
PY
)

# exec_cmd should contain {{PROMPT_JSON}} placeholder for safely quoted prompt.
command=${exec_cmd//\{\{PROMPT_JSON\}\}/$escaped_prompt}
exec /bin/bash -lc "$command"
