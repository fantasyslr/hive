---
phase: 04-feishu-bridge
verified: 2026-03-28T03:10:00Z
status: gaps_found
score: 4/6 must-haves verified
re_verification: false
gaps:
  - truth: "Agent 能写飞书文档（不仅限于多维表格）"
    status: failed
    reason: "feishu-mcp 只实现了 write_bitable（多维表格写入），没有 write_doc 工具，飞书文档为只读"
    artifacts:
      - path: "packages/feishu-mcp/src/tools/"
        issue: "缺少 write-doc.ts，现有工具只有 read-bitable, write-bitable, read-doc, list-bitables"
    missing:
      - "write_doc MCP tool — 调用飞书 /docx/v1/documents/{id}/blocks API 写入文档内容"

  - truth: "FS-04: webhook-receiver 被 Gateway 实际采用，两侧共享签名验证逻辑"
    status: failed
    reason: "packages/feishu-mcp/src/webhook-receiver.ts 实现了完整的 FeishuWebhookReceiver（含 AES-256-CBC 解密），但 hive-gw/src/routes/feishu-webhook.ts 完全没有导入它，两者各自独立实现了 token 校验，代码重复且加密解密路径被孤立"
    artifacts:
      - path: "packages/feishu-mcp/src/webhook-receiver.ts"
        issue: "定义了 FeishuWebhookReceiver 类但没有任何导入者，是孤立的死代码"
      - path: "packages/hive-gw/src/routes/feishu-webhook.ts"
        issue: "内联实现了相同的 token 校验逻辑，未复用 shared webhook-receiver，且不支持加密事件（encryptKey 路径缺失）"
    missing:
      - "将 FeishuWebhookReceiver 移入 @hive/shared 或从 feishu-mcp 导出，并在 feishu-webhook.ts 中引用"
      - "Gateway webhook route 支持 FEISHU_ENCRYPT_KEY 以处理加密事件体"

human_verification:
  - test: "MCP 工具链端到端：用 FEISHU_APP_ID/APP_SECRET 启动 feishu-mcp，调用 read_bitable 读取真实多维表格记录"
    expected: "返回 items 数组，records 包含实际字段值，total > 0"
    why_human: "需要真实飞书应用凭证，无法在本地 CI 中验证"
  - test: "Gateway webhook 挑战握手：向 /webhooks/feishu POST url_verification 类型 body"
    expected: "响应 {challenge: <value>}，HTTP 200"
    why_human: "需要设置 FEISHU_WEBHOOK_VERIFY_TOKEN 环境变量并运行 Gateway"
  - test: "飞书变更事件触发 EventBus：向 /webhooks/feishu POST bitable.record.changed 事件，检查 /events SSE 流是否出现 feishu.changed"
    expected: "SSE 流中出现 type=feishu.changed 的事件，data 含 event_type, app_token, table_id"
    why_human: "需要运行中的 Gateway 实例和 SSE 客户端订阅"
---

# Phase 04: Feishu Bridge Verification Report

**Phase Goal:** Agent 能读写飞书多维表格和文档，飞书变更自动触发 Gateway 事件，实现外部数据驱动的自动化流程
**Verified:** 2026-03-28T03:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent 能读飞书多维表格记录 | ✓ VERIFIED | `read_bitable` 工具已实现，调用 `/bitable/v1/apps/{app_token}/tables/{table_id}/records`，含分页、过滤、字段归一化 |
| 2 | Agent 能写飞书多维表格记录（增/改/删） | ✓ VERIFIED | `write_bitable` 工具已实现，支持 batch_create / batch_update / batch_delete，最多 50 条 |
| 3 | Agent 能读飞书文档内容 | ✓ VERIFIED | `read_doc` 工具已实现，调用 `/docx/v1/documents/{id}` + `/raw_content`，输出 title + content + revision |
| 4 | Agent 能写飞书文档内容 | ✗ FAILED | 只有 read_doc，无 write_doc，文档写入路径缺失 |
| 5 | 飞书变更 POST 到 Gateway 自动触发 `feishu.changed` EventBus 事件 | ✓ VERIFIED | `createFeishuWebhookRouter` 注册在 `/webhooks/feishu`，token 校验后调用 `eventBus.emit({ type: 'feishu.changed', data: {...} })`，`feishu.changed` 已加入 `HiveEventType` 联合类型 |
| 6 | Webhook 逻辑可复用，两侧共享签名/解密 | ✗ FAILED | `FeishuWebhookReceiver`（含 AES-256-CBC 解密）在 feishu-mcp 中孤立，Gateway 重复内联了 token 校验且不支持加密事件体 |

**Score:** 4/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/feishu-mcp/src/tools/read-bitable.ts` | 读取多维表格 MCP 工具 | ✓ VERIFIED | 实现完整，含字段归一化，注册到 MCP server |
| `packages/feishu-mcp/src/tools/write-bitable.ts` | 写入多维表格 MCP 工具 | ✓ VERIFIED | create/update/delete 三种操作，错误处理完整 |
| `packages/feishu-mcp/src/tools/read-doc.ts` | 读取文档 MCP 工具 | ✓ VERIFIED | 调用 metadata + raw_content 两个接口，返回结构化结果 |
| `packages/feishu-mcp/src/tools/write-doc.ts` | 写入文档 MCP 工具 | ✗ MISSING | 文件不存在 |
| `packages/feishu-mcp/src/tools/list-bitables.ts` | 列出多维表格 MCP 工具 | ✓ VERIFIED | 实现完整 |
| `packages/feishu-mcp/src/feishu-auth.ts` | OAuth token 管理（含缓存/刷新） | ✓ VERIFIED | 缓存 token，5 分钟提前刷新，错误有描述性 message |
| `packages/feishu-mcp/src/feishu-client.ts` | HTTP 客户端（含限速、429 重试） | ✓ VERIFIED | 实现 GET/POST，429 Retry-After 重试一次，解析 Feishu code/data 结构 |
| `packages/feishu-mcp/src/rate-limiter.ts` | 令牌桶限速器 | ✓ VERIFIED | 令牌桶算法，FIFO 队列，dispose() 清理 timer |
| `packages/feishu-mcp/src/webhook-receiver.ts` | Webhook 接收/解密器 | ⚠️ ORPHANED | 实现完整（含 AES-256-CBC 解密），但未被任何文件导入 |
| `packages/hive-gw/src/routes/feishu-webhook.ts` | Gateway Feishu webhook 路由 | ✓ VERIFIED | token 校验、challenge 握手、event 转发到 EventBus 均实现 |
| `packages/shared/src/types.ts` (feishu.changed) | EventBus 事件类型定义 | ✓ VERIFIED | `feishu.changed` 加入 `HiveEventType`，`FeishuChangeEvent` 接口已定义 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `feishu-webhook.ts` | `eventBus` | `eventBus.emit({ type: 'feishu.changed', ... })` | ✓ WIRED | 注入 EventBus 依赖，emit 调用在 event callback 分支 |
| `hive-gw/src/index.ts` | `feishu-webhook.ts` | `createFeishuWebhookRouter(eventBus)` | ✓ WIRED | 有条件挂载到 `/webhooks/feishu`，env var 控制 |
| `feishu-mcp/src/index.ts` | `write-bitable.ts` | `registerWriteBitable(server, client)` | ✓ WIRED | 4 个工具均在 main() 中注册 |
| `webhook-receiver.ts` | `feishu-webhook.ts` (Gateway) | import | ✗ NOT_WIRED | `FeishuWebhookReceiver` 从未被导入，是死代码 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `read-bitable.ts` | `data.items` | Feishu `/bitable/v1/apps/.../records` API | 是（直接透传 API 响应） | ✓ FLOWING |
| `write-bitable.ts` | `data.records` | Feishu batch_create/update/delete API | 是（返回 record_id 列表） | ✓ FLOWING |
| `read-doc.ts` | `rawContent.content` | Feishu `/docx/v1/documents/{id}/raw_content` API | 是（直接透传 API 响应） | ✓ FLOWING |
| `feishu-webhook.ts` (GW) | `eventBus.emit` data | `req.body` (Feishu POST payload) | 是（从请求体提取字段） | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| feishu-mcp 单元测试 | `npm -w packages/feishu-mcp test` | 2 test files, 9 tests passed | ✓ PASS |
| feishu-mcp TypeScript 类型检查 | `cd packages/feishu-mcp && tsc --noEmit` | 无错误 | ✓ PASS |
| hive-gw TypeScript 类型检查（feishu 相关） | `cd packages/hive-gw && tsc --noEmit` | feishu-webhook.ts 无错误（其他路由有 2 个预存错误，与本 phase 无关） | ✓ PASS |
| MCP server 启动（需凭证） | 需要 FEISHU_APP_ID/APP_SECRET | 无法验证 | ? SKIP |

---

### Requirements Coverage

> 注意：`.planning/REQUIREMENTS.md` 不存在，REQUIREMENTS.md 对应的全量需求文件已从 git 删除（见 git status D .planning/REQUIREMENTS.md）。以下基于需求 ID 语义和代码实现进行推断评估。

| Requirement | Description（推断） | Status | Evidence |
|-------------|---------------------|--------|----------|
| FS-01 | feishu-mcp 包：MCP server 连接飞书 API，支持 Auth + 限速 | ✓ SATISFIED | feishu-auth.ts + feishu-client.ts + rate-limiter.ts 实现完整，9 个单元测试通过 |
| FS-02 | Agent 能读飞书多维表格（read_bitable, list_bitables） | ✓ SATISFIED | 两个工具均注册，含分页/过滤 |
| FS-03 | Agent 能读飞书文档（read_doc） | ✓ SATISFIED | read_doc 工具注册，返回 title + content + revision |
| FS-04 | Agent 能写飞书多维表格（write_bitable） | ✓ SATISFIED | write_bitable 工具注册，支持 create/update/delete |
| FS-05 | 飞书变更自动触发 Gateway EventBus 事件 | ? PARTIAL | webhook route 已实现且挂载，token 校验、feishu.changed 事件分发正确；但 webhook-receiver.ts 的加密解密路径被孤立，Gateway 不支持加密事件体 |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `packages/feishu-mcp/src/webhook-receiver.ts` | 完整类实现但零导入者（孤立死代码） | ⚠️ Warning | 加密事件解密功能（AES-256-CBC）无法生效，如飞书配置了 Encrypt Key 则所有事件将被 Gateway 以 400 拒绝 |
| `packages/hive-gw/src/routes/feishu-webhook.ts` | 与 webhook-receiver.ts 重复实现 token 校验逻辑 | ⚠️ Warning | 维护点分散，未来若修改 token 校验逻辑需双处修改 |
| `packages/feishu-mcp/src/tools/` | 缺少 write_doc，文档能力不对称（读有写无） | 🛑 Blocker | Phase goal 明确要求"读写飞书文档"，当前 docs 只读 |

---

### Human Verification Required

#### 1. MCP 工具真实 API 调用

**Test:** 设置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 环境变量，运行 `npm -w packages/feishu-mcp start`，通过 MCP client 调用 `read_bitable`
**Expected:** 返回多维表格真实记录，`items` 非空，`total` > 0
**Why human:** 需要真实飞书 Open Platform 应用凭证，本地无法模拟

#### 2. Gateway webhook 挑战握手

**Test:** 运行 `FEISHU_WEBHOOK_VERIFY_TOKEN=test123 npm run dev`，向 `POST /webhooks/feishu` 发送 `{"type":"url_verification","token":"test123","challenge":"abc123"}`
**Expected:** HTTP 200，响应体 `{"challenge":"abc123"}`
**Why human:** 需要启动 Gateway 实例

#### 3. 飞书变更事件 → EventBus → SSE 全链路

**Test:** Gateway 运行中，SSE 客户端订阅 `/events`，向 `/webhooks/feishu` POST `{"header":{"event_type":"bitable.record.changed","event_id":"e1","token":"test123"},"event":{"app_token":"appT","table_id":"tblX"}}`
**Expected:** SSE 流中出现 `type=feishu.changed`，data 含 `app_token: "appT"`, `table_id: "tblX"`
**Why human:** 需要完整 Gateway 实例 + SSE 客户端

---

### Gaps Summary

**2 个 Blocker 类 Gap 阻止 Phase Goal 完全达成：**

**Gap 1 — 文档写入缺失（影响 FS-03 写方向）**
Phase goal 明确要求"读写飞书文档"，但 feishu-mcp 中只有 `read_doc`，没有 `write_doc`。飞书文档对 Agent 来说目前是只读的。需实现 `write-doc.ts`，调用飞书 `/docx/v1/documents/{id}/blocks/batch_update` API。

**Gap 2 — webhook-receiver.ts 孤立，加密支持断链（影响 FS-05）**
`FeishuWebhookReceiver` 类（含完整 AES-256-CBC 解密实现）存在于 feishu-mcp 包中，但从未被 Gateway 导入使用。Gateway webhook route 自行内联了 token 校验，导致：
1. 若飞书配置了 Encrypt Key，所有事件将以 400 被拒绝（Gateway 无法解密）
2. 验证逻辑存在两个独立实现，维护分裂

修复路径：将 `FeishuWebhookReceiver` 迁移到 `@hive/shared`，在 Gateway route 中替换内联校验逻辑，并增加 `FEISHU_ENCRYPT_KEY` 可选环境变量支持。

---

_Verified: 2026-03-28T03:10:00Z_
_Verifier: Claude (gsd-verifier)_
