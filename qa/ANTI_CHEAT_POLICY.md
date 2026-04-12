# Anti-Cheat Policy

> Prevents agents from grading their own work or writing tests that match implementation instead of requirements.
> Created: 2026-04-13

---

## Core Problem

An agent that writes both code and tests can "cheat" by making tests match the current (possibly broken) implementation rather than testing what the app is *supposed* to do.

---

## Rules

### 1. Separation of Concerns
- The agent that wrote the code MUST NOT be the final authority on test expectations.
- Claude Code = builder/fixer. It does NOT evaluate its own output.
- Codex = PM/oracle/spec owner. It owns what "correct" means.
- Gemini CLI = independent adversarial evaluator. It tries to break PASS claims.

### 2. Spec Freeze
- Specs freeze BEFORE any fix attempt begins.
- A frozen spec cannot be edited by the fixer agent.
- Any post-failure spec change requires a `SPEC-BUG` label and PM approval.
- SPEC-BUG means the spec itself was wrong, not that the fix failed.

### 3. Evidence-Gated Completion
- PASS requires mandatory evidence artifacts (see `EVIDENCE_REQUIREMENTS.md`).
- Missing evidence = FAIL, never PASS.
- Evaluator timeout = BLOCKED or RETRY, never PASS.
- "It works on my machine" is not evidence.

### 4. Checkpoint Immutability
- Failed checkpoints cannot disappear from the record.
- Allowed dispositions: `PASS`, `FAIL`, `BLOCKED`, `SPEC-BUG`, `STUCK`, `NEEDS_HUMAN_DECISION`.
- A checkpoint may transition FAIL -> PASS only with new evidence.
- A checkpoint may transition FAIL -> SPEC-BUG only with PM approval.
- A checkpoint may NEVER transition FAIL -> deleted/hidden.

### 5. Max Attempt Limits
- Max 2 fixer attempts per checkpoint before status becomes `STUCK`.
- STUCK items escalate to human or PM decision.
- Infinite retry loops are forbidden.

### 6. Oracle Independence
- Test expectations derive from: product rules, architecture docs, design decisions, PM directives.
- Test expectations NEVER derive from reading implementation code.
- If a test passes because it matches buggy code, that is a test bug.

### 7. Self-Healing Constraints
- Self-healing MAY repair: broken locators, changed selectors, test infrastructure issues.
- Self-healing MUST NOT: weaken assertions, change expected behavior, remove checkpoints, lower thresholds.
- Any self-healing change to a product assertion requires `SPEC-BUG` process.

### 8. Adversarial Spot Checks
- Random spot checks should re-verify already-passing items.
- If a spot check fails on a previously-passing item, it becomes a regression and re-enters the queue.
- Passing once does not mean passing forever.

### 9. Linear as External Scoreboard
- Progress lives in Linear, not in agent prose or context windows.
- An agent claiming "done" without a Linear status update is invalid.
- Linear is the single external record of QA state.

### 10. Negative Tests for Invariants
- Critical invariants must have negative tests that WOULD fail if the invariant were broken.
- Example: a test that attempts a query without eventId and expects rejection.
- Example: a test that sends a notification without idempotency key and expects block.

---

## Disposition Reference

| Status | Meaning | Who Sets It |
|--------|---------|-------------|
| `PASS` | Checkpoint verified with evidence | Evaluator (Gemini) + PM (Codex) |
| `FAIL` | Checkpoint failed, needs fix | Evaluator (Gemini) |
| `BLOCKED` | Cannot test due to environment/dependency issue | Any agent |
| `SPEC-BUG` | Spec itself is incorrect, needs PM revision | PM (Codex) only |
| `STUCK` | 2 fix attempts failed, needs human | System (after max attempts) |
| `NEEDS_HUMAN_DECISION` | Ambiguous requirement, cannot resolve autonomously | Any agent |

---

## Violations

If any of these rules are broken:
1. The affected checkpoint reverts to FAIL.
2. The violation is logged in the QA packet.
3. The loop pauses for PM review.
4. The violating agent's output for that packet is discarded.
