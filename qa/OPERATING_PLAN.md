# QA Operating Plan

> Phase 0 governance document. Defines the overall QA hardening program for GEM India.
> Created: 2026-04-13

---

## Purpose

This is a self-healing, adversarial QA program for an AI-built conference management app. The goal is to make the app robust through iterative discovery, testing, fixing, and verification — not merely diagnose it.

The current implementation is NOT the source of truth. The oracle comes from product requirements, architecture docs, design decisions, and explicit PM rules.

---

## Architecture

```
Oracle (frozen specs + product rules)
  -> Feature Census (agent-browser discovery)
  -> Test Spec Generation (checkpoint-style atomic specs)
  -> Linear Queue (external scoreboard)
  -> Adversarial Evaluation (Gemini CLI)
  -> TDD Fixes (Claude Code)
  -> Browser Verification (agent-browser evidence)
  -> Evidence-Gated Completion
  -> Repeat
```

---

## Phases

### Phase 0: Governance (THIS PHASE)
- Create governance files under `qa/`
- Define agent roles, evidence requirements, anti-cheat policy
- Define Ralph-compatible loop contract
- Recommend pilot module
- NO app code changes

### Phase 0B: Tooling Hardening
- Upgrade `feature-census` to use `agent-browser`
- Add GEM-specific invariant extraction
- Add strict JSON schemas for census output
- Add Linear export format

### Phase 0C: Manual Pilot
- Run one three-model pilot on pilot module (events/workspace)
- Codex creates oracle-backed QA packet
- Gemini critiques for weak assertions
- Claude Code executes fixes
- Observe failure modes before automating

### Phase 1: High-Risk Modules
- Scale module by module with Linear as queue
- One QA packet per fresh agent session
- Max iterations and max fix rounds per packet

### Phase 2: AFK Ralph Loop
- Fully automated chained loop
- Linear as external progress tracker
- agent-browser as evidence engine
- Codex adversarial review before completion

### Phase 3: Regression Pack
- Permanent smoke/regression suite
- Role-matrix tests
- Event-isolation tests
- Mutation-audit tests
- Public-flow tests

---

## Key Files

| File | Purpose |
|------|---------|
| `qa/OPERATING_PLAN.md` | This file — overall plan |
| `qa/ANTI_CHEAT_POLICY.md` | Rules preventing agent self-grading |
| `qa/EVIDENCE_REQUIREMENTS.md` | What constitutes valid PASS evidence |
| `qa/TEST_ORACLE.md` | Source of truth for expected behavior |
| `qa/MODULE_PRIORITIES.md` | Module testing order and risk assessment |
| `qa/LINEAR_WORKFLOW.md` | Linear statuses, fields, and issue format |
| `qa/AGENT_ROLES.md` | Which model does what |
| `qa/RALPH_LOOP_CONTRACT.md` | Atomic QA packet contract for Ralph-style loops |
| `qa/PILOT_MODULE_PLAN.md` | First module pilot details |
| `qa/templates/` | Prompt templates for each agent role |

---

## Invariants (Always True)

These are GEM India product invariants that every test must respect:

1. Every database query filters by `eventId` (per-event data isolation)
2. Every API route validates input with Zod before processing
3. Every mutation to travel/accommodation/transport writes to the audit log
4. Every notification send checks the idempotency key in Redis before sending
5. Phone numbers are normalized to E.164 on input using `libphonenumber-js`
6. Timestamps stored in UTC, displayed in IST using `date-fns-tz`
7. File upload max: 20MB
8. Clerk role behavior respected:
   - Super Admin: everything
   - Event Coordinator: Events, Program, Registration, Comms, Certs
   - Ops: Travel, Accommodation, Transport ONLY (NOT Events CRUD, Program, Registration, Comms, Certs)
   - Read-only: all visible, write actions disabled (not hidden)
   - NOTE: Whether Ops needs dashboard shell event-context to reach logistics is a PM decision to verify — distinct from Events CRUD access
9. Notifications go through `lib/notifications/`, never direct provider calls
10. Cascade events emitted via Inngest, never manual downstream updates
11. Red flags follow 3-state lifecycle: unreviewed -> reviewed -> resolved
12. Optimistic locking via `updated_at` on sessions, travel, accommodation

---

## Ground Rules

- Implementation code is evidence of WHAT EXISTS, not WHAT IS CORRECT
- Specs freeze before fixes begin
- Failed checkpoints never disappear
- One logical fix per commit
- No completion claim without fresh verification evidence
- Self-healing repairs locators/test-maintenance only — never weakens product assertions
- Claude Code (fixer) must NEVER modify `src/lib/` or shared modules without PM approval — report BLOCKED instead

---

## Untracked-File Verification Note

Phase 0 files are new/untracked. Normal `git diff -- qa` shows nothing for untracked files.

To review Phase 0 changes, use one of:
- `git status --short` to list all new files
- `git add -N qa/ && git diff -- qa` to see intent-to-add diff (then `git reset qa/` to unstage)
- Or simply list created files and summarize contents

Do NOT commit Phase 0 files until PM explicitly approves.
