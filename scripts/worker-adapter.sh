#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-claude}"
TASK_TITLE="${HIVE_TASK_TITLE:-}"
TASK_DESC="${HIVE_TASK_DESCRIPTION:-}"
MEMORY_CONTEXT="${HIVE_MEMORY_CONTEXT:-}"

PROMPT="You are a Hive AI worker (role: ${ROLE}).
Task: ${TASK_TITLE}
Description: ${TASK_DESC}
${MEMORY_CONTEXT:+
Relevant history from team memory:
${MEMORY_CONTEXT}}

Complete this task and output the result. Be concise and actionable."

case "$ROLE" in
  claude) claude -p "$PROMPT" ;;
  gemini) gemini -p "$PROMPT" ;;
  codex)  codex exec "$PROMPT" ;;
  *) echo "Unknown role: $ROLE" >&2; exit 1 ;;
esac
