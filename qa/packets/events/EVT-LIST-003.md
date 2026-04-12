# QA Packet: EVT-LIST-003

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-LIST-003 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | READY |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-LIST-003 |
| Description | Clicking an event in the list navigates to the Event Workspace (M21) |
| Route(s) | `/events` (M02) -> `/events/[id]` (M21) |
| Role | Super Admin (`org:super_admin`) |
| Type | Navigation |

## Spec (DRAFT — NOT FROZEN until Codex PM approves)

### Preconditions
- Dev server running on port 4000
- User authenticated as Super Admin via Clerk
- At least one event exists in the database
- Events list page (M02) is loaded and visible

### Steps
1. Navigate to `/events`
2. Wait for events list to fully load
3. Click/tap on an event card/row
4. Wait for navigation to complete

### Expected Result
- Browser navigates to the Event Workspace route for the selected event (e.g., `/events/[eventId]`)
- Event Workspace (M21) loads with the selected event's data
- The workspace shows the event name/title matching the clicked event
- No console errors during navigation
- Workspace content visible within 5 seconds after click on local dev server (no loading state persists beyond this threshold)
- Back navigation from M21 returns to M02

### Invariants Checked
- [x] INV-001: The workspace loads data scoped to the selected eventId only
- [x] INV-008: Super Admin has full access to event workspace

### Forbidden Behavior
- Navigation MUST NOT fail silently (blank page, 404, or error boundary)
- Workspace MUST NOT show data from a different event
- Route MUST include a valid event identifier for the selected event (oracle documents routes as `/events/[id]`)
- The UI MUST NOT expose stack traces, secrets, or debug dumps during navigation
- _Future security-hardening note: URL enumeration resistance (e.g., opaque slugs) is not an oracle requirement and is deferred to a dedicated security pass._

## Oracle Sources
- `research-hub/PROJECT_HANDOFF.md` — Navigation graph: M02 -> select event -> M21
- `qa/oracle/navigation-graph.json` — flows.event_workspace_flow
- `qa/oracle/event-isolation-rules.json` — EI-006: switching events reloads data for new eventId
- `qa/oracle/role-matrix.json` — events.super_admin.read = true

## Evidence Required
- [ ] Screenshot of events list before click
- [ ] Screenshot of event workspace after navigation
- [ ] Console output (no errors during transition)
- [ ] Network check (workspace API calls include correct eventId)
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
- Labels: `module:events`, `risk:critical`, `type:navigation`

## History
| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| 2026-04-13 | Claude Code | Created DRAFT packet | — |
| 2026-04-13 | Claude Code | Amendment: Gemini 3.1 Pro critique — replaced "no infinite spinner" with 5-second explicit timeout | — |
| 2026-04-13 | Codex PM | Frozen after Gemini 3.1 Pro re-critique returned FREEZE_READY | Re-critique command: `cat /tmp/gemini-recritique-prompt.md \| gemini -m gemini-3.1-pro-preview` |
