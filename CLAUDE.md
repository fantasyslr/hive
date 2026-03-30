<!-- GSD:project-start source:PROJECT.md -->
## Project

**Hive v1: AI-Native Team Kanban**

A lightweight collaboration gateway that lets a small team (3-5 people) manage work through a visual kanban board where AI agents (Claude, Codex, Gemini) are first-class participants. Tasks are created by humans, automatically or manually assigned, and each person collaborates with different AI tools to complete their work. Results flow back to a shared board for review and reuse.

Think of it as "Trello where AI does the heavy lifting" — humans create tasks, monitor progress, adjust direction, and accept results; AI executes.

**Core Value:** Every task's process and output is captured in shared memory, so the team never starts from scratch on similar work again.

### Constraints

- **Tech stack**: TypeScript monorepo (npm workspaces), Express, SQLite WAL, Vitest. Frontend: React + Vite.
- **API naming inconsistency**: Some fields are camelCase (requiredCapabilities), some snake_case (verification_required). Must unify before adding more API surface.
- **Memory limitations**: Current vector search is O(n) full scan with hash-based 384-dim vectors. Fine for MVP scale (~1000 entries) but needs FTS for larger teams.
- **No remote access yet**: Gateway binds localhost:3000. Need to expose for team access.
- **Feishu dependency**: Team uses Feishu for communication. Feishu webhook receiver exists but feishu-mcp fate undecided (keep vs replace with Lark CLI).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
