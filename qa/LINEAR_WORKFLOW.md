# Linear Workflow

> How Linear is used as the external scoreboard for the QA program.
> Created: 2026-04-13

---

## Statuses

| Status | Meaning | Who Sets |
|--------|---------|----------|
| `Backlog` | Spec created, not yet queued | Codex (PM) |
| `Ready for QA` | Spec frozen, ready for evaluation | Codex (PM) |
| `Running` | Evaluator currently testing | Gemini / agent-browser |
| `Failed` | Checkpoint failed, evidence captured | Gemini (evaluator) |
| `Fixing` | Claude Code working on fix | Claude Code (fixer) |
| `Needs Adversarial Review` | Fix submitted, awaiting adversarial check | Claude Code -> Codex/Gemini |
| `Verified` | Fix verified with fresh evidence | Gemini (evaluator) |
| `Blocked` | Cannot test (env issue, dependency, timeout) | Any agent |
| `Stuck` | 2 fix attempts failed, needs human | System |
| `Done` | Fully verified with evidence | Codex (PM) final approval |

---

## Issue Template

Each Linear issue is one atomic QA packet:

```
Title: [MODULE] Checkpoint: {checkpoint-description}

Module: {module-name}
Route(s): {route-pattern}
Spec file: qa/specs/{module}/{spec-id}.md
Checkpoints: {list of checkpoint IDs}
Required role/session: {clerk-role}
Required event state: {what must exist in DB}

Expected evidence:
  - Screenshot of {state}
  - Console output (no errors)
  - Network trace for {API call}
  - Test command output

Current status: {status}
Latest run: {ISO timestamp}
Attempt count: {n}/2

Failures:
  - Attempt 1: {description + evidence link}
  - Attempt 2: {description + evidence link}

Artifacts:
  - qa/evidence/{module}/{checkpoint-id}/screenshot.png
  - qa/evidence/{module}/{checkpoint-id}/console.txt
  - qa/evidence/{module}/{checkpoint-id}/metadata.json

Fix commits:
  - {commit-hash}: {one-line description}

Disposition: PASS | FAIL | BLOCKED | SPEC-BUG | STUCK | NEEDS_HUMAN_DECISION
```

---

## Labels

| Label | Purpose |
|-------|---------|
| `module:{name}` | Which module (events, registration, travel, etc.) |
| `risk:critical` | Cross-event leakage, role bypass, audit gaps |
| `risk:high` | Validation, cascade, notification issues |
| `risk:medium` | UI state, responsive, error handling |
| `risk:low` | Smoke tests, static pages |
| `invariant:{type}` | Which GEM invariant is being tested |
| `spec-bug` | Spec was wrong, needs PM revision |
| `stuck` | Max attempts exceeded |
| `regression` | Previously passing, now failing |

---

## Workflow Transitions

```
Backlog -> Ready for QA       (PM freezes spec)
Ready for QA -> Running       (evaluator picks up)
Running -> Failed             (checkpoint fails with evidence)
Running -> Verified           (checkpoint passes with evidence)
Running -> Blocked            (environment/dependency issue)
Failed -> Fixing              (fixer picks up)
Fixing -> Needs Adversarial Review  (fix submitted)
Needs Adversarial Review -> Verified  (adversarial review passes)
Needs Adversarial Review -> Failed    (adversarial review finds issue)
Failed -> Stuck               (after 2 fix attempts)
Stuck -> Needs Human Decision (escalation)
Verified -> Done              (PM final sign-off)
Any -> Spec-Bug               (spec itself was wrong)
```

---

## Rules

1. Only PM (Codex) moves issues to `Done`
2. Only evaluator (Gemini) moves issues to `Verified`
3. Fixer (Claude Code) cannot move issues to `Verified` or `Done` — ever, under any circumstance
4. `Stuck` issues require human intervention before resuming
5. Every status transition must include a comment with evidence or explanation
6. No issue may skip from `Failed` directly to `Done`
7. `Blocked` issues are retried once after environment fix, then `Stuck`

---

## Disposition-to-Status Mapping

| QA Packet Disposition | Linear Status | Who Sets |
|----------------------|---------------|----------|
| PASS (evaluator evidence) | `Verified` | Gemini (evaluator) |
| — (PM final approval after Verified) | `Done` | Codex (PM) only |
| FAIL | `Failed` | Gemini (evaluator) |
| BLOCKED | `Blocked` | Any agent |
| STUCK | `Stuck` | System (after max attempts) |
| SPEC-BUG | label added, status varies | Codex (PM) only |
| NEEDS_HUMAN_DECISION | `Stuck` or `Blocked` | Any agent |

**Explicit prohibition:** Claude Code (fixer) may NEVER set Linear status to `Verified` or `Done`. If Claude Code believes a fix is complete, it sets `Needs Adversarial Review` and waits for the evaluator.
