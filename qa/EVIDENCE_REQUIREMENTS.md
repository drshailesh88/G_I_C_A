# Evidence Requirements

> Defines what constitutes valid evidence for PASS/FAIL dispositions.
> Created: 2026-04-13

---

## Principle

**No evidence = FAIL.** An agent claiming something works without proof is not a valid PASS.

---

## Browser Checkpoint Evidence (Required for UI/E2E)

Every browser PASS must include ALL of:

| Artifact | Description | Format |
|----------|-------------|--------|
| Route visited | The URL/path tested | String |
| User action performed | What was done (click, fill, navigate) | Description |
| Expected UI result | What should appear/change | Assertion statement |
| Actual UI result | What was observed | Screenshot or snapshot |
| Console/errors check | Browser console output, page errors | Text dump |
| Network check | Relevant API calls and responses | Request/response summary |
| Screenshot/snapshot | Visual proof of state | PNG or agent-browser snapshot |
| Module regression | No regression in related module tests | Test command output |

### Evidence File Structure

```
qa/evidence/{module}/{checkpoint-id}/
  screenshot.png
  snapshot.json
  console.txt
  network.txt
  test-output.txt
  metadata.json
```

### metadata.json Schema

```json
{
  "checkpoint_id": "events-ws-001",
  "module": "events",
  "route": "/dashboard/events/[eventId]",
  "role": "org:super_admin",
  "action": "Create new event",
  "expected": "Event created, redirected to workspace",
  "actual": "PASS | FAIL description",
  "timestamp": "2026-04-13T10:00:00Z",
  "agent": "gemini-cli",
  "evidence_files": ["screenshot.png", "console.txt", "network.txt", "test-output.txt"],
  "large_artifacts": {
    "screenshot.png": {
      "path": "qa/evidence/events/events-ws-001/screenshot.png",
      "sha256": "abc123...",
      "captured_at": "2026-04-13T10:00:00Z"
    }
  },
  "disposition": "PASS"
}
```

---

## API/Unit Test Evidence (Required for backend logic)

| Artifact | Description |
|----------|-------------|
| Test command | Exact command run |
| Test output | Full stdout/stderr |
| Exit code | 0 = pass, non-zero = fail |
| Coverage delta | If applicable |
| Mutation score | If Stryker was run |

---

## Invariant Test Evidence

For GEM India invariants, negative tests must prove the guard works:

| Invariant | Negative Test | Expected Result |
|-----------|---------------|-----------------|
| eventId filtering | Query without eventId | Rejection/empty/error |
| Zod validation | Invalid payload to API route | 400 with validation errors |
| Audit log | Mutation to travel/accommodation/transport | Audit record created |
| Idempotency | Duplicate notification send | Second send blocked |
| E.164 normalization | Non-E.164 phone input | Normalized or rejected |
| 20MB upload limit | File > 20MB | Rejection with size error |
| Role enforcement | Ops user accessing Events CRUD (create/edit/delete) | Forbidden/blocked (Ops has Travel/Accommodation/Transport only) |
| Read-only enforcement | Read-only user clicking write action | Disabled/blocked |

---

## What Does NOT Count as Evidence

- Agent prose saying "it works"
- Code review without execution
- Test files existing without being run
- Screenshots from a previous session (must be fresh per verification)
- Passing tests that don't actually assert the checkpoint behavior

---

## Timeout Rules

| Scenario | Disposition |
|----------|-------------|
| Evaluator times out | BLOCKED (retry once, then STUCK) |
| Browser doesn't load | BLOCKED (check dev server) |
| Test hangs | BLOCKED (kill after 60s) |
| Agent crashes mid-evaluation | BLOCKED (retry from clean state) |
| Missing evidence after "PASS" claim | FAIL (evidence is mandatory) |

---

## Evidence Retention

### Always Persisted (committed to repo)
- `metadata.json` — checkpoint ID, timestamp, disposition, agent, evidence file list, hashes/links
- `console.txt` — browser console output
- `network.txt` — relevant request/response summary
- `test-output.txt` — test command stdout/stderr

### Large Artifacts (screenshots, videos, snapshots)
- MAY be stored in `qa/evidence/` or an external artifact store (R2, CI artifact, etc.)
- If stored externally, `metadata.json` MUST record: artifact path/URL, capture timestamp, and SHA-256 hash
- If stored locally and too large for git, add to `.gitignore` but keep `metadata.json` referencing the path
- Absence of the large artifact is acceptable IF metadata records the hash and the artifact can be reproduced

### Rules
- All evidence files stay in `qa/evidence/` until the QA program completes
- Linear issues link to evidence files via relative paths or external URLs
- Overwriting old evidence with new evidence for the same checkpoint is allowed (latest run wins)
- **Missing metadata.json = FAIL.** If metadata cannot be written, the checkpoint cannot be PASS or BLOCKED — it is FAIL.
- **Missing console.txt or test-output.txt = FAIL.** These are mandatory for every checkpoint regardless of type.
- Evidence from a previous session is STALE and invalid for current disposition
