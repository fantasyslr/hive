# Hive Worker Bridge v1

把 Hive 从“只会分任务”升级成“自动接任务并回写结果”的最小 runtime。

## 现在已经有的能力

- 自动注册 agent
- 自动 heartbeat
- 自动轮询 board
- 自动处理分配给自己的 claimed task
- 自动推进为 working / done / failed
- 可选向 `claude-main` 发审批请求
- 支持按角色启动 profile：`claude` / `gemini` / `codex`
- 支持通过 adapter 把任务环境变量喂给外部 CLI

## 快速启动

### Gemini worker

```bash
cd /Users/slr/hive
HIVE_GEMINI_EXEC_COMMAND='gemini -p {{PROMPT_JSON}}' npm run worker:gemini
```

### Codex worker

```bash
cd /Users/slr/hive
HIVE_CODEX_EXEC_COMMAND='codex exec {{PROMPT_JSON}}' npm run worker:codex
```

### Claude orchestrator worker

```bash
cd /Users/slr/hive
HIVE_CLAUDE_EXEC_COMMAND='claude -p {{PROMPT_JSON}}' npm run worker:claude
```

> 上面三条命令里的具体 CLI 调用参数，取决于你本机安装的版本。当前 bridge 已经把任务注入接口做好，adapter 只需要把 `{{PROMPT_JSON}}` 接到对应 CLI。

## 角色启动脚本

- `npm run worker:gemini`
- `npm run worker:codex`
- `npm run worker:claude`

这些脚本会自动带上默认的：

- `HIVE_AGENT_ID`
- `HIVE_AGENT_NAME`
- `HIVE_CAPABILITIES`
- `HIVE_INTERESTS`
- `HIVE_AGENT_ENDPOINT`
- `HIVE_WORKER_COMMAND`

## Adapter 机制

`worker-bridge.ts` 执行任务时会注入：

- `HIVE_TASK_ID`
- `HIVE_TASK_TITLE`
- `HIVE_TASK_DESCRIPTION`
- `HIVE_TASK_JSON`

默认通过：

```bash
bash scripts/worker-adapter.sh <role>
```

再由 adapter 调用实际 CLI。

## 命令模板占位符

CLI 执行命令支持：

- `{{PROMPT_JSON}}` — 已安全 JSON 转义的完整 prompt

## 当前边界

这个版本已经消灭了“手动轮询 board + 手动更新状态”这部分脏活。

还剩下的最后一步，是根据你本机实际安装的 Claude / Gemini / Codex CLI 版本，把它们各自的执行命令参数对齐好。只要参数打通，整轮就能自动跑。
