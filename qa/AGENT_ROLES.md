# Agent Roles

> Defines which model/tool does what in the QA program.
> Created: 2026-04-13

---

## Role Assignment

| Role | Agent | Responsibility |
|------|-------|---------------|
| PM / Oracle Owner | Codex | Owns specs, priority, Linear, gate policy, final disposition |
| Builder / Fixer | Claude Code | Fixes failures with TDD/minimal changes, produces code |
| Adversarial Evaluator | Gemini CLI | Independently evaluates, tries to break PASS claims |
| Browser Evidence Engine | agent-browser | Captures screenshots, snapshots, console, network |
| External Scoreboard | Linear | Tracks progress, statuses, evidence links |

---

## Codex (PM / Oracle Owner)

### Responsibilities
- Creates oracle-backed QA packets from product docs
- Freezes specs before fix attempts begin
- Makes final PASS/FAIL/SPEC-BUG dispositions
- Manages Linear backlog and priorities
- Reviews whether a fix actually addresses the spec
- Decides module priority order
- Approves or rejects SPEC-BUG requests
- Performs adversarial code review of fixes

### Cannot Do
- Fix application code
- Weaken or remove specs without SPEC-BUG process
- Mark something PASS without evidence
- Override the evaluator without explanation

### Prompt Template
See `qa/templates/CODEX_PM_REVIEW_PROMPT.md`

---

## Claude Code (Builder / Fixer)

### Responsibilities
- Reads frozen spec and failure evidence
- Writes minimal TDD fix (red-green-refactor)
- Produces one logical fix per commit
- Runs typecheck/lint/unit tests before submitting
- Updates Linear status to "Needs Adversarial Review"
- Provides fix description and affected files

### Cannot Do
- Grade its own work (no self-PASS)
- Delete or weaken failing tests
- Modify specs or oracle documents
- Mark Linear issues as Verified or Done — EVER
- Change files outside the target module (if shared `src/lib/` changes appear needed, STOP and report BLOCKED/NEEDS_HUMAN_DECISION for PM approval)
- Skip eventId filtering, Zod validation, or audit logging

### Constraints
- Max 2 fix attempts per checkpoint
- Must read spec before coding
- Must run tests before claiming fix
- Must commit one logical change only

### Prompt Template
See `qa/templates/CLAUDE_FIXER_PROMPT.md`

---

## Gemini CLI (Adversarial Evaluator)

### Model Policy (PM decision 2026-04-13)

All Gemini evaluator and critique runs MUST use an explicit model flag:

```bash
# Preferred
gemini -m gemini-3.1-pro-preview

# Fallback chain (try in order if preferred is unavailable)
gemini -m gemini-3-pro-preview
gemini -m pro
```

If all models are unavailable, report **BLOCKED**. Do NOT fall back to default `gemini` (no model flag). Every Gemini report MUST include the exact command used, requested model, any fallback with error messages, and full output.

### Responsibilities
- Runs against live app via agent-browser or test commands
- Tries to break the PASS claim with edge cases
- Captures evidence artifacts (screenshots, console, network)
- Reports PASS with evidence or FAIL with reproduction steps
- Performs random spot checks on already-passing items
- Critiques QA packets for weak assertions before freeze

### Cannot Do
- Fix code
- Create or modify specs (only critique them)
- Mark Linear issues as Done (only Verified or Failed)
- Accept a PASS without mandatory evidence

### Evaluation Criteria
- Does the UI match the wireframe/spec?
- Does the console show errors?
- Does the network show unexpected failures?
- Does the role enforcement work?
- Does the eventId scoping hold?
- Would a different input break it?

### Prompt Template
See `qa/templates/GEMINI_EVALUATOR_PROMPT.md`

---

## agent-browser (Evidence Engine)

### Responsibilities
- Opens routes in real browser with specified role/session
- Takes screenshots and snapshots
- Captures console output and page errors
- Records network requests/responses
- Fills forms, clicks buttons, navigates
- Provides deterministic browser evidence

### Configuration
- Browser: Chrome for Testing (147.0.7727.56)
- Location: `/Users/shaileshsingh/.agent-browser/browsers/chrome-147.0.7727.56`
- Dev server: `http://localhost:4000` (port 4000 always)
- Auth: Clerk session cookies for role-based testing

### Cannot Do
- Evaluate correctness (it captures, doesn't judge)
- Fix code
- Modify the app

---

## Linear (External Scoreboard)

### Responsibilities
- Single source of truth for QA progress
- Tracks statuses, evidence, attempt counts
- Provides queue for next work item
- Prevents agents from hiding failures

### Not Responsible For
- Deciding correctness
- Running tests
- Storing evidence (only links to it)

---

## Interaction Protocol

```
1. Codex creates QA packet -> Linear "Backlog"
2. Codex freezes spec -> Linear "Ready for QA"
3. Gemini evaluates -> captures evidence -> Linear "Running" then "Failed" or "Verified"
4. If Failed: Claude Code picks up -> Linear "Fixing"
5. Claude Code submits fix -> Linear "Needs Adversarial Review"
6. Gemini re-evaluates with fresh evidence
7. If passes: Codex reviews and sets "Done"
8. If fails again: increment attempt count
9. After 2 attempts: Linear "Stuck" -> escalate
```
