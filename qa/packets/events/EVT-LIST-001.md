# QA Packet: EVT-LIST-001

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-LIST-001 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | READY |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-LIST-001 |
| Description | Events list loads and displays events for authenticated user |
| Route(s) | `/events` (M02) |
| Role | Super Admin (`org:super_admin`) |
| Type | Happy Path |

## Frozen Spec

### Preconditions
- Dev server running on port 4000
- User authenticated as Super Admin via Clerk
- At least one event exists in the database

### Steps
1. Navigate to `/events`
2. Wait for page to fully load (no loading spinners remain)
3. Observe the events list

### Expected Result
- The events list page renders without errors
- At least one event card/row is visible with event name and date
- No console errors or unhandled exceptions
- Timestamps displayed in IST (Asia/Kolkata), not UTC
- Initial meaningful content (at least one event card/row) visible within 5 seconds on local dev server

### Invariants Checked
- [x] INV-006: Timestamps displayed in IST
- [x] INV-008: Role enforcement — Super Admin has full read access
- [x] INV-012: No hardcoded secrets visible in page source

### Forbidden Behavior
- Events from a different organization/tenant MUST NOT appear (if multi-tenant applies)
- No raw UTC timestamps displayed to user
- No JavaScript console errors

### Future Packet Notes
- **EVT-LIST-002 (DRAFT-FUTURE)**: Empty state behavior when 0 events exist — deferred from this packet.
- **EVT-LIST-006 (DRAFT-FUTURE)**: Organization/tenant isolation — verify events from other orgs are not visible. Not added to this pilot scope.

## Oracle Sources
- `research-hub/PROJECT_HANDOFF.md` — M02 Events List screen, navigation graph (authenticated default landing)
- `qa/oracle/navigation-graph.json` — entry_points.authenticated.default = M02
- `qa/oracle/role-matrix.json` — events.super_admin.read = true
- `qa/oracle/product-rules.json` — INV-006, INV-008

## Evidence Required
- [ ] Screenshot of events list with at least one event visible
- [ ] Console output (no errors)
- [ ] Network check (API calls succeed, no 4xx/5xx)
- [ ] `metadata.json` with route, role, action, expected, actual, disposition

## Disposition
- Result: _pending_
- Set by: _pending Codex PM review_
- Timestamp: —
- Reason: —

## Fix Attempts
_None yet_

## Linear Issue
- Issue ID: _to be created_
- Labels: `module:events`, `risk:critical`, `type:happy-path`

## History
| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| 2026-04-13 | Claude Code | Created DRAFT packet | — |
| 2026-04-13 | Claude Code | Amendment: Gemini 3.1 Pro critique — replaced "reasonable load time" with 5-second threshold; added future packet notes | — |
| 2026-04-13 | Codex PM | Frozen after Gemini 3.1 Pro re-critique returned FREEZE_READY | Re-critique command: `cat /tmp/gemini-recritique-prompt.md \| gemini -m gemini-3.1-pro-preview` |
