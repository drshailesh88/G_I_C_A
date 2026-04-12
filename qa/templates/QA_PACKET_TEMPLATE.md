# QA Packet: {PACKET_ID}

> Module: {MODULE}
> Created: {DATE}
> Status: READY | RUNNING | PASS | FAIL | BLOCKED | STUCK | SPEC-BUG | NEEDS_HUMAN_DECISION

---

## Checkpoint

**ID:** {CHECKPOINT_ID}
**Description:** {What is being tested}
**Route(s):** {Route pattern(s)}
**Role:** {Clerk role key}
**Type:** {Happy path | Validation | Role | Invariant | Error handling | Edge case}

---

## Spec (FROZEN — do not modify after freeze)

### Preconditions
- {What must be true before the test runs}
- {Required database state}
- {Required user session/role}

### Steps
1. {Action 1}
2. {Action 2}
3. {Action 3}

### Expected Result
- {What should happen}
- {What the UI should show}
- {What the API should return}
- {What should NOT happen}

### Invariants Checked
- [ ] eventId filtering present in relevant queries
- [ ] Zod validation on API input
- [ ] Audit log written (if mutation to travel/accommodation/transport)
- [ ] Notification idempotency (if notification sent)
- [ ] Phone E.164 normalization (if phone input)
- [ ] Timestamp UTC storage / IST display (if timestamp shown)
- [ ] File size limit (if upload)
- [ ] Role enforcement correct

---

## Evidence (filled by evaluator)

### Artifacts
- Screenshot: `qa/evidence/{MODULE}/{CHECKPOINT_ID}/screenshot.png`
- Console: `qa/evidence/{MODULE}/{CHECKPOINT_ID}/console.txt`
- Network: `qa/evidence/{MODULE}/{CHECKPOINT_ID}/network.txt`
- Test output: `qa/evidence/{MODULE}/{CHECKPOINT_ID}/test-output.txt`
- Metadata: `qa/evidence/{MODULE}/{CHECKPOINT_ID}/metadata.json`

### Evaluator Notes
{Free-form notes from the evaluator about what was observed}

---

## Disposition

**Result:** {PASS | FAIL | BLOCKED | SPEC-BUG | STUCK | NEEDS_HUMAN_DECISION}
**Set by:** {Agent name}
**Timestamp:** {ISO timestamp}
**Reason:** {Why this disposition}

---

## Fix Attempts (if FAIL)

### Attempt 1
- **Fixer:** Claude Code
- **Root cause:** {What was wrong}
- **Fix:** {What was changed}
- **Commit:** {hash}
- **Files modified:** {list}
- **Tests added/modified:** {list}
- **Result after re-evaluation:** {PASS | FAIL}

### Attempt 2
- **Fixer:** Claude Code
- **Root cause:** {What was still wrong}
- **Fix:** {What was changed}
- **Commit:** {hash}
- **Files modified:** {list}
- **Tests added/modified:** {list}
- **Result after re-evaluation:** {PASS | FAIL | STUCK}

---

## Linear Issue

- **Issue ID:** {LINEAR-ID}
- **URL:** {Linear URL}
- **Labels:** module:{MODULE}, risk:{LEVEL}, {additional labels}
- **Current status:** {Linear status}

---

## History

| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| {ISO} | Codex | Created packet | READY |
| {ISO} | Codex | Froze spec | READY |
| {ISO} | Gemini | Evaluated | FAIL |
| {ISO} | Claude Code | Fix attempt 1 | — |
| {ISO} | Gemini | Re-evaluated | PASS |
| {ISO} | Codex | Final approval | DONE |
