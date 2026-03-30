# Hive Cleanup Guide

用于清理本地试用、demo、smoke、runner 残留状态。

## 最常用

```bash
cd /Users/slr/hive
bash scripts/cleanup-state.sh
```

默认会尝试清理：
- `demo-agent*`
- `smoke-1`
- `runner-agent`
- `usability-agent`
- `usability-agent-2`
- 这些 agent 关联的 demo/smoke/runner task

脚本带一个本地锁；同一时间只应该跑一条 cleanup，避免两次删除互相踩。

## 定向清理

只清 demo：

```bash
bash scripts/cleanup-state.sh --demo-only
```

只清 smoke：

```bash
bash scripts/cleanup-state.sh --smoke-only
```

只清 runner / usability：

```bash
bash scripts/cleanup-state.sh --runner-only
```

只清某个 agent：

```bash
bash scripts/cleanup-state.sh --agent-id runner-agent
```

## npm script

```bash
npm run cleanup
```

## 预期结果

脚本会：
1. 先检查 `/health`
2. 扫 `/board`
3. 列出准备删除的 agent / task
4. 先删 task，再删 agent
5. 最后打印新的 board 摘要

这是环境卫生脚本，不是业务归档脚本。只适合本地试用和演示环境。
