# QA Packet: EVT-WS-001

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-WS-001 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | READY |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-WS-001 |
| Description | Event Workspace (M21) loads correctly with event data and module navigation |
| Route(s) | `/events/[id]` (M21) |
| Role | Super Admin (`org:super_admin`) |
| Type | Happy Path |

## Frozen Spec

### Preconditions
- Dev server running on port 4000
- User authenticated as Super Admin via Clerk
- At least one event exists in the database
- User has selected an event from M02 (or navigates directly to `/events/[validEventId]`)

### Steps
1. Navigate to the Event Workspace for a known event (via M02 click or direct URL)
2. Wait for workspace to fully load
3. Observe the workspace layout

### Expected Result
- Workspace page renders without errors
- Event name/title is displayed and matches the selected event
- Module navigation links/cards are visible (Program, Registration, Travel, Accommodation, Transport, Communications, Certificates, QR, Reports, Branding, Settings — as applicable to role)
- Key event metadata is visible (dates, venue, status)
- Timestamps displayed in IST
- No console errors
- No loading state persists indefinitely

### Invariants Checked
- [x] INV-001: All data displayed is scoped to this eventId
- [x] INV-006: Timestamps in IST
- [x] INV-008: Super Admin sees all module navigation links

### Forbidden Behavior
- Workspace MUST NOT display data from a different event
- Workspace MUST NOT show module links the current role cannot access (not applicable for Super Admin, but foundational check)
- No JavaScript errors or unhandled exceptions
- The UI MUST NOT expose stack traces, secrets, or debug dumps
- _Future security-hardening note: hiding internal identifiers from the UI is not an oracle requirement and is deferred to a dedicated security pass._

## Oracle Sources
- `research-hub/PROJECT_HANDOFF.md` — M21 Event Workspace screen, Event workspace hub with accessible modules
- `qa/oracle/navigation-graph.json` — event_workspace_hub: accessible_modules list
- `qa/oracle/event-isolation-rules.json` — EI-006: workspace loads data for selected eventId
- `qa/oracle/role-matrix.json` — super_admin has access to all modules
- `research-hub/DESIGN_DECISIONS.md` — UX Decision 1: dashboard layout

## Evidence Required
- [ ] Screenshot of full workspace with event name and module navigation visible
- [ ] Console output (no errors)
- [ ] Network check (API calls include correct eventId parameter)
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
| 2026-04-13 | Codex PM | Frozen after Gemini 3.1 Pro re-critique returned FREEZE_READY | Re-critique command: `cat /tmp/gemini-recritique-prompt.md \| gemini -m gemini-3.1-pro-preview` |
