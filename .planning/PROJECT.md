# Hive v1: AI-Native Team Kanban

## What This Is

A lightweight collaboration gateway that lets a small team (3-5 people) manage work through a visual kanban board where AI agents (Claude, Codex, Gemini) are first-class participants. Tasks are created by humans, automatically or manually assigned, and each person collaborates with different AI tools to complete their work. Results flow back to a shared board for review and reuse.

Think of it as "Trello where AI does the heavy lifting" — humans create tasks, monitor progress, adjust direction, and accept results; AI executes.

## Core Value

Every task's process and output is captured in shared memory, so the team never starts from scratch on similar work again.

## Requirements

### Validated

- ✓ Agent registration with capabilities/interests — existing
- ✓ Task creation with auto-dispatch (interest > capability > load > starvation scoring) — existing
- ✓ Task state machine (pending → claimed → working → done/failed) with optimistic locking — existing
- ✓ VerifyLoop auto-verification (task.completed → auto-verify → auto-fix, max 2 cycles) — existing
- ✓ SSE real-time event stream — existing
- ✓ P2P agent relay — existing
- ✓ Shared memory (SQLite + vector search, public/agent namespace) — existing
- ✓ Auto-write conclusions to memory on task completion — existing
- ✓ Board snapshot persistence and recovery — existing
- ✓ Feishu webhook receiver — existing

### Active

- [ ] Web kanban UI (task board, agent status, task detail)
- [ ] Simple user authentication (4 users: 投放, 运营, 素材, 主管)
- [ ] Memory enhancement: source tracking (which agent, which task)
- [ ] Memory enhancement: namespace as independent field (not title prefix)
- [ ] Memory enhancement: deduplication
- [ ] Memory enhancement: TTL / expiration
- [ ] Task templates (e.g., "Campaign" auto-creates sub-tasks for each role)
- [ ] Campaign workflow: parent task splits into role-specific sub-tasks
- [ ] Historical task browsing and search
- [ ] Progress overview for managers (who's done, who's pending)
- [ ] Lovart MCP integration (AI image generation via API)

### Out of Scope

- Full RBAC permission system — overkill for 4 people, simple role field is enough
- Drag-and-drop kanban — nice-to-have, not MVP (status buttons are fine)
- Predictive analytics — basic historical stats first, ML-based prediction later
- Virse integration — no public API found, revisit when available
- Multi-tenant / SaaS deployment — single-team internal tool for now
- Mobile app — web-only for MVP
- Budget/cost tracking — requires LLM provider APIs that don't exist yet (Max Plan has no usage API)

## Context

- **Existing codebase:** Hive v0 is a working multi-agent gateway (37 commits, 61 tests passing). TypeScript monorepo with Express Gateway + SQLite Memory MCP + Feishu MCP.
- **Team:** Moody Lenses cross-border e-commerce, 3-4 people (ad buyer, operations, creative, manager)
- **Pain points:** (1) Every similar campaign starts from scratch — no organizational memory. (2) Each person uses different AI tools, outputs scattered across personal accounts. (3) No visibility into who's doing what.
- **Competitive landscape:** Trello/Monday.com adding AI features from the top; Hive approaches from AI-first. Unique differentiators: agent-agnostic, shared semantic memory, VerifyLoop auto-verification.
- **Design system:** Frontend uses Impeccable (impeccable.style) — AI-native design skills for typography, layout, effects.
- **Deployment:** Currently localhost, target is Aliyun ECS (same as MiroFishmoody).

## Constraints

- **Tech stack**: TypeScript monorepo (npm workspaces), Express, SQLite WAL, Vitest. Frontend: React + Vite.
- **API naming inconsistency**: Some fields are camelCase (requiredCapabilities), some snake_case (verification_required). Must unify before adding more API surface.
- **Memory limitations**: Current vector search is O(n) full scan with hash-based 384-dim vectors. Fine for MVP scale (~1000 entries) but needs FTS for larger teams.
- **No remote access yet**: Gateway binds localhost:3000. Need to expose for team access.
- **Feishu dependency**: Team uses Feishu for communication. Feishu webhook receiver exists but feishu-mcp fate undecided (keep vs replace with Lark CLI).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gateway is dumb broker, orchestration in prompt file | Hot-updatable, keeps gateway simple | ✓ Good |
| Memory namespace is convention-based (no ACL) | 4-person team, security boundary unnecessary | — Pending |
| SQLite for everything (no PostgreSQL) | Zero-ops, single-file, sufficient for team scale | — Pending |
| Frontend as separate package (packages/hive-ui/) | Monorepo consistency, shared types | — Pending |
| Impeccable for frontend design | User preference, AI-native design system | — Pending |
| API field naming: unify to camelCase | Most existing fields already camelCase, fewer changes | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-30 after initialization*
