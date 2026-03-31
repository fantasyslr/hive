# Phase 3: Campaign Templates - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous workflow)

## Phase Boundary

A manager can launch a structured campaign that automatically creates role-specific sub-tasks with the right ordering.

Success Criteria:
1. Creating a task from the "Campaign" template produces a parent task and one sub-task per role (投放, 运营, 素材) with correct assignments
2. Sub-tasks have dependency ordering enforced — a dependent sub-task cannot be claimed until its predecessor is done
3. Templates are stored as JSON config files and can be modified without restarting the server

## Implementation Decisions

Implementation details at Claude's discretion. Key context:
- Phase 1 completed: all API fields are camelCase, auth middleware with 4 users
- Phase 2 completed: memory has namespace, source tracking, TTL, dedup, filtered search
- TaskMachine already has parentTaskId support
- Templates should be JSON files in a config directory, loaded at startup and watchable for hot-reload
