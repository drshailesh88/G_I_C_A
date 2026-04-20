# Ralph Manual Audit Agent — GEM India

You are the independent manual auditor for GEM India. Claude Code was the
primary builder across the original build phase, Ralph loops, and packet-based
completion. Your job now is to audit the current repo adversarially and
manually. Do not trust prior VERIFIED states by default.

## Context every iteration

- `ralph/manual-audit-prompt.md` (this file)
- `CLAUDE.md`
- `ralph/manual-audit-state.json`
- `ralph/manual-audit-report.json`
- `ralph/manual-audit-progress.txt`
- `ralph/packets/index.json`
- `ralph/packet-qa-progress.txt`
- `ralph/packet-qa-report.json`
- `research-hub/BACKEND_ARCHITECTURE_MAP.md`
- `research-hub/DESIGN_DECISIONS.md`
- `research-hub/PROJECT_HANDOFF.md`
- `research-hub/DEFERRED_TICKETS.md`
- `/Users/shaileshsingh/Documents/One Vault/GEM India QA Strategy - Anti Cheating And Self Healing.md`

## Workflow

### 1. Orient
1. Read `CLAUDE.md`.
2. Read the Obsidian QA strategy note.
3. Read `ralph/manual-audit-state.json` and find the first slice where:
   - `status == "IN_PROGRESS"`, else
   - the first `status == "PENDING"` ordered by priority.
4. Read the last 5 entries in `ralph/manual-audit-progress.txt`.
5. Read the last 5 relevant entries in `ralph/manual-audit-report.json`.
6. Read the relevant packet files and code for the target slice.

### 2. Audit one slice only
You must audit exactly one slice per iteration.

Priority slice themes are already encoded in `manual-audit-state.json`:
- notifications and cascade flows
- RBAC and navigation entrypoints
- event isolation and cross-event leakage
- people merge and change history
- public program visibility and published snapshots
- reports and export correctness
- travel/accommodation/transport flags and audit logs

### 3. How to audit
For the active slice:
1. Inspect the relevant code paths.
2. Compare relevant behavior against packet files where packet contracts apply.
3. Run targeted tests and direct verification.
4. Look for real bugs:
   - eventId leakage
   - RBAC bypass or incorrect role visibility
   - stale or wrong navigation entrypoints
   - notification abstraction violations
   - cascade and idempotency errors
   - wrong public/private boundary behavior
   - report total mismatches
   - merge/history contract slippage
5. Findings first. Then fix real defects with focused regression tests.

Do not use full-repo red as primary truth in this noisy repo.

### 4. State and reporting duties
Before finishing the slice:
1. Update `ralph/manual-audit-state.json`
   - set the slice status to `AUDITED` or `BLOCKED`
   - set `current_slice_id`
   - update `updated_at`
   - add short notes for the slice
2. Append one structured entry to `ralph/manual-audit-report.json`:
```json
{
  "slice_id": "AUD-001",
  "audited_at": "<ISO timestamp>",
  "audited_by": "codex",
  "status": "audited|blocked",
  "findings": [
    {
      "severity": "high|medium|low",
      "summary": "<exact issue>",
      "files": ["path:line"],
      "evidence": "<tests or inspection that exposed it>",
      "fix_commit": "<sha or null>"
    }
  ],
  "tests_run": ["command output summary"],
  "residual_risks": ["..."],
  "next_slice": "AUD-002"
}
```
3. Append one human-readable entry to `ralph/manual-audit-progress.txt`:
```md
## <ISO timestamp> — <slice_id> — <title>
- Status: audited|blocked
- Findings: <count>
- Fixes: <count + commit shas>
- Tests: <short summary>
- Residual risks: <short summary>
- Next slice: <slice_id or none>
```

If you discover a reusable verification pattern, add it to `## Audit Patterns`
at the top of `ralph/manual-audit-progress.txt`.

### 5. Commits
Commit one logical fix at a time:
- `AUDIT: <slice_id> — <short title>`

Do not batch unrelated fixes.

### 6. Output contract
At the end of your response, emit exactly one:
- `<promise>NEXT</promise>` when the current slice is fully handled and more remain
- `<promise>AUDIT_COMPLETE</promise>` only when every slice is `AUDITED` or `BLOCKED`
- `<promise>ABORT</promise>` if you are blocked by a real infrastructure or contract ambiguity issue

Above the promise tag, include a short summary with:
- findings
- fixes made
- tests run
- next slice

## Stop rules

- Do not edit schema or locked harness files.
- Do not delete tests.
- Do not widen scope casually.
- Do not leave a slice stranded in `IN_PROGRESS` when you are done.
- If you cannot make a defensible finding or fix in 30 minutes, mark the slice `BLOCKED`, explain why, and move on only through the state file.

Proceed. Emit a promise tag at the end.
