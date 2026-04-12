# Ralph Loop Contract

> Defines the atomic QA packet format and loop rules for Ralph-style automation.
> Created: 2026-04-13

---

## Principles

- One QA packet per loop iteration
- Fresh agent session per iteration (no context rot)
- State persisted in files and Linear (not agent memory)
- Max iterations enforced externally
- Evidence required before any PASS

---

## Atomic QA Packet

Each iteration of the loop works on exactly ONE packet:

```yaml
packet_id: "{module}-{checkpoint-number}"
module: "{module-name}"
routes:
  - "{route-pattern-1}"
  - "{route-pattern-2}"
spec_file: "qa/specs/{module}/{spec-id}.md"
checkpoint_id: "{checkpoint-id}"
checkpoint_description: "{what is being tested}"
role: "{clerk-role-key}"
event_state: "{what must exist for the test to run}"
linear_issue_id: "{LINEAR-ID}"

status: "READY | RUNNING | PASS | FAIL | BLOCKED | STUCK | SPEC-BUG | NEEDS_HUMAN_DECISION"
attempt_count: 0
max_attempts: 2

evidence_required:
  - screenshot
  - console_output
  - network_trace
  - test_command_output

evidence_path: "qa/evidence/{module}/{checkpoint-id}/"
```

---

## Loop Execution

### Per-Iteration Steps

```
1. READ packet from queue (next READY or FAILED item)
2. READ frozen spec
3. VERIFY dev server is running on port 4000
4. EXECUTE checkpoint via agent-browser or test command
5. CAPTURE evidence to evidence_path
6. EVALUATE: compare actual vs expected from spec
7. SET disposition:
   - Evidence matches spec -> PASS
   - Evidence contradicts spec -> FAIL
   - Cannot execute -> BLOCKED
   - Spec itself seems wrong -> SPEC-BUG (flag for PM)
8. WRITE evidence metadata.json
9. UPDATE Linear issue with disposition + evidence links
10. IF FAIL and attempt_count < max_attempts:
    - Hand to fixer (Claude Code)
    - Fixer reads spec + failure evidence
    - Fixer writes minimal TDD fix
    - Fixer commits one logical change
    - Increment attempt_count
    - Re-queue packet as READY for re-evaluation
11. IF FAIL and attempt_count >= max_attempts:
    - Set status to STUCK
    - Update Linear
    - Move to next packet
12. NEXT iteration
```

---

## State File

Progress persists in `qa/LOOP_STATE.json`:

```json
{
  "current_packet_id": "events-ws-003",
  "iteration_count": 47,
  "started_at": "2026-04-13T10:00:00Z",
  "last_updated": "2026-04-13T14:30:00Z",
  "stats": {
    "total_packets": 120,
    "passed": 32,
    "failed": 8,
    "stuck": 2,
    "blocked": 3,
    "spec_bug": 1,
    "remaining": 74
  },
  "queue": ["events-ws-004", "events-ws-005", "reg-001"]
}
```

---

## Guard Rails

### Max Attempts
- 2 fix attempts per checkpoint, then STUCK
- STUCK requires human decision before resuming
- No infinite retry loops

### Evidence Gate
- Missing evidence = FAIL, not PASS
- Stale evidence (from previous session) = invalid
- Evidence must be captured in the CURRENT iteration

### Timeout
- agent-browser command timeout: 60 seconds
- Test command timeout: 120 seconds
- Total packet timeout: 10 minutes
- Timeout = BLOCKED (retry once from clean state)

### Self-Healing Scope
- MAY auto-fix: broken locators, selector changes, port conflicts
- MUST NOT auto-fix: assertion logic, expected values, checkpoint removal
- Any assertion change requires SPEC-BUG process

### Context Reset
- Each iteration starts with fresh agent context
- Agent reads: this contract, the spec file, the evidence requirements
- Agent does NOT inherit state from previous iterations via context window
- All state comes from files (qa/LOOP_STATE.json, Linear, evidence/)

---

## Fixer Contract (Claude Code within loop)

When the fixer is invoked:

1. Read the frozen spec file
2. Read the failure evidence (screenshot, console, network)
3. Identify the root cause
4. Write a failing regression test (RED)
5. Write minimal fix (GREEN)
6. Run typecheck + lint + unit tests
7. Commit one logical change
8. Update Linear to "Needs Adversarial Review"
9. Exit (do not self-verify)

Fixer constraints:
- Cannot modify spec files
- Cannot modify evidence files
- Cannot delete or weaken tests
- Cannot change files outside target module — if `src/lib/` or shared module changes appear needed, STOP and report BLOCKED/NEEDS_HUMAN_DECISION for PM approval
- Cannot set Linear to Verified or Done
- Must respect all GEM India invariants

---

## Evaluator Contract (Gemini within loop)

When the evaluator is invoked:

1. Read the frozen spec file
2. Read checkpoint expected behavior
3. Execute via agent-browser or test command
4. Capture all required evidence
5. Compare actual vs expected
6. Set disposition with explanation
7. Save evidence to evidence_path
8. Update Linear with result + evidence links
9. Exit

Evaluator constraints:
- Cannot fix code
- Cannot modify specs
- Cannot skip evidence capture
- Must report honestly (no "benefit of the doubt")
- Must try edge cases, not just happy path

---

## Entry/Exit Criteria

### Entry (start the loop)
- [ ] Dev server running on port 4000
- [ ] At least one frozen spec exists
- [ ] Linear project configured with correct statuses
- [ ] agent-browser verified working
- [ ] qa/LOOP_STATE.json initialized
- [ ] Role sessions configured in Clerk

### Exit (stop the loop)
- All packets are PASS, STUCK, BLOCKED, or SPEC-BUG
- OR max total iterations reached (configurable, default 200)
- OR human signals stop
