# QA Packet: EVT-CREATE-002

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-CREATE-002 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | BLOCKED |
| AMENDED | 2026-04-13 — PM decisions applied: required fields frozen, date validation resolved; attempt-2 evidence complete; Gemini evaluator blocked by transport failures |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-CREATE-002 |
| Description | Create Event form validates input with Zod and rejects invalid submissions |
| Route(s) | `/events/new` or equivalent (M14) |
| Role | Super Admin (`org:super_admin`) |
| Type | Validation / Edge Case |

## Frozen Spec

### Preconditions
- Dev server running on port 4000
- User authenticated as Super Admin via Clerk
- Create Event form (M14) is loaded and visible

### Required Fields (PM decision 2026-04-13)
Minimum required fields for event creation:
- **Event name** (string, non-empty)
- **Start date** (valid date)
- **End date** (valid date, must not be before start date)
- **Venue name** (string, non-empty)

Optional fields (not required for creation): description, address/city/map URL, module toggles.

### Steps
1. Leave all required fields empty
2. Click Submit/Create button
3. Observe validation errors
4. Fill in event name only, leave dates and venue empty
5. Click Submit/Create again
6. Observe validation errors
7. Fill all required fields with valid data but set end date before start date
8. Click Submit/Create
9. Observe validation response
10. **Server-side bypass check**: Using browser console or equivalent, submit an invalid payload directly to the server action/API route (bypassing client-side validation) with missing required fields
11. Observe server response
12. **XSS payload check**: Submit event name containing `<script>alert(1)</script>` via form or direct API call
13. Observe whether the payload is rejected or safely treated as inert text
14. **SQLi payload check**: Submit venue name containing `' OR '1'='1` via form or direct API call
15. Observe whether the payload is rejected or safely treated as inert text

### Expected Result
- Step 2-3: Form displays validation error messages for all four missing required fields (name, start date, end date, venue name). No API call is made. No partial record is created.
- Step 5-6: Form displays validation errors for missing date and venue fields. Event name error is cleared.
- Step 8-9: End date before start date MUST be rejected server-side before persistence (PM decision 2026-04-13). Client-side validation may also reject it, but server-side rejection is the requirement. The form or API must return a clear error message about invalid date range.
- Step 10-11: Server action/API MUST return a 400/validation error with Zod error details for missing required fields. No partial record created in database. This proves server-side Zod enforcement (INV-002) independently of client-side UI.
- Step 12-13: XSS payload (`<script>alert(1)</script>`) MUST be either rejected by Zod validation or safely treated as inert text (stored as escaped string, no script execution). No record created with executable script content. No alert dialog triggered.
- Step 14-15: SQLi payload (`' OR '1'='1`) MUST be either rejected by Zod validation or safely treated as inert text (Drizzle ORM parameterized queries). No SQL injection behavior. No unintended records returned or modified.
- All validation happens via Zod schema before any database operation
- No console errors beyond expected validation feedback

### Invariants Checked
- [x] INV-002: Zod validation before processing — invalid input MUST be rejected
- [x] INV-001: No partial/orphaned records created in database on validation failure

### Forbidden Behavior
- Form MUST NOT submit to the API with missing required fields
- Form MUST NOT create a partial database record on validation failure
- Form MUST NOT show a generic/unhelpful error — field-specific messages expected
- Form MUST NOT allow SQL injection or XSS via input fields
- End date before start date MUST NOT be persisted to database
- Server action/API MUST NOT accept invalid payloads even when client-side validation is bypassed
- XSS payloads MUST NOT execute in the browser (no alert, no DOM injection)
- SQLi payloads MUST NOT alter query behavior (Drizzle ORM parameterized queries prevent this)

## Oracle Sources
- `qa/oracle/product-rules.json` — INV-002: Zod validation on every API route
- `research-hub/PROJECT_HANDOFF.md` — M14 Create Event screen
- `research-hub/BACKEND_ARCHITECTURE_MAP.md` — Drizzle ORM schema for events table
- PM decision 2026-04-13: Required fields = event name, start date, end date, venue name. End-before-start rejected server-side.

## Evidence Required
- [ ] Screenshot of validation errors (empty form submission) — all 4 required field errors visible
- [ ] Screenshot of partial validation errors (name filled, others empty)
- [ ] Screenshot of end-date-before-start-date rejection
- [ ] Server-side bypass evidence: direct API/server-action call with invalid payload returns 400/validation error with Zod error details (proves INV-002 server-side)
- [ ] XSS evidence: `<script>alert(1)</script>` in event name is rejected or stored as inert text; no script execution
- [ ] SQLi evidence: `' OR '1'='1` in venue name is rejected or stored as inert text; no SQL behavior
- [ ] Console output (no unhandled errors, no XSS alert)
- [ ] Network check: no API call made on client-side invalid submission, AND API returns 400 with Zod errors when bypassed directly
- [ ] `metadata.json` with route, role, action, expected, actual, disposition

## Disposition
- Result: BLOCKED
- Set by: Codex PM
- Timestamp: 2026-04-13
- Reason: Attempt-2 evidence bundle satisfies the frozen product checks on PM review, but the required independent Gemini evaluator could not produce a verdict. The preferred model `gemini-3.1-pro-preview` and both mandated fallbacks (`gemini-3-pro-preview`, `pro`) failed with the same TLS transport error while calling `https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse` (`ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC`). Anti-cheat policy does not allow promotion to PASS without evaluator plus PM review, so the packet is blocked pending Gemini infrastructure recovery.

## Fix Attempts
### Attempt 1
- Executor: Claude Code
- Result: FAIL
- Evidence: qa/evidence/events/EVT-CREATE-002/attempt-1/
- Findings: Server-side Zod validation correctly rejects invalid data before DB insert. However: (1) server action returns HTTP 500 instead of 400; (2) UI renders raw Zod error JSON instead of field-specific validation messages; (3) empty/partial form submissions rely on HTML5 required attributes showing one error at a time via browser tooltip, not all 4 field errors simultaneously.

### Attempt 2
- Executor: Claude Code + agent-browser evidence capture
- Result: BLOCKED_EVALUATOR
- Fix commits: `e26f12b`, `1acb7ca`
- Evidence: qa/evidence/events/EVT-CREATE-002/attempt-2/
- Findings: Browser evidence now shows all 4 client-side required errors together, partial submission clears only the name error, invalid date range is rejected with structured server-side validation, bypass submissions return `{ ok: false, status: 400, fieldErrors }`, and XSS/SQLi payloads remain inert text with no console errors. However, the mandatory Gemini adversarial review could not complete because all allowed Gemini models failed with the same TLS transport error; see `qa/evidence/events/EVT-CREATE-002/attempt-2/gemini-evaluation.txt`.

## Linear Issue
- Issue ID: _to be created_
- Labels: `module:events`, `risk:critical`, `type:validation`, `invariant:INV-002`

## History
| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| 2026-04-13 | Claude Code | Created DRAFT packet | — |
| 2026-04-13 | Claude Code | Amendment: required fields frozen, date validation resolved per PM decisions | — |
| 2026-04-13 | Claude Code | Amendment: Gemini 3.1 Pro critique — added server-side bypass check, XSS/SQLi payload tests, strengthened evidence requirements | — |
| 2026-04-13 | Codex PM | Frozen after Gemini 3.1 Pro re-critique returned FREEZE_READY | Re-critique command: `cat /tmp/gemini-recritique-prompt.md \| gemini -m gemini-3.1-pro-preview` |
| 2026-04-13 | Codex PM | Attempt 1 failed validation UX/server response requirements | FAIL |
| 2026-04-13 | Codex PM | Attempt 2 evidence reviewed; PM screenshot spot-check passed; Gemini fallback chain failed with TLS transport errors on all mandated models | BLOCKED |
