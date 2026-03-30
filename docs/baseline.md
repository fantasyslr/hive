# Hive Baseline State

当前本地试用基线目标：

- `/health` 返回 `status=ok`
- `memoryReady=true`
- `/board` 默认为空板或接近空板
- 不保留 smoke/demo/runner 的残留 agent 与 task

## 收回到基线

```bash
cd /Users/slr/hive
npm run cleanup
```

如果要彻底归零当前 board（包括历史 agent/task），使用一次性重置：

```bash
python3 - <<'PY'
import json, urllib.request
from urllib.request import Request, urlopen
base='http://localhost:3000'
board=json.load(urlopen(f'{base}/board'))
for task in board['tasks']:
    urlopen(Request(f"{base}/tasks/{task['id']}", method='DELETE'))
for agent in board['agents']:
    urlopen(Request(f"{base}/agents/{agent['agent_id']}", method='DELETE'))
print(json.load(urlopen(f'{base}/board')))
PY
```

注意：
- `cleanup-state.sh` 是环境卫生脚本，只清试用/演示相关对象
- 上面的“一次性重置”会清掉 board 上当前全部 agent 与 task，适合做新的演示基线
