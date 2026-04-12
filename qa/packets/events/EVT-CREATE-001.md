# QA Packet: EVT-CREATE-001

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-CREATE-001 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | READY |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-CREATE-001 |
| Description | Create Event form (M14) loads with all required fields |
| Route(s) | `/events/new` or equivalent (M14) |
| Role | Super Admin (`org:super_admin`) |
| Type | Happy Path |

## Frozen Spec

### Preconditions
- Dev server running on port 4000
- User authenticated as Super Admin via Clerk
- User is on the Events List page (M02)

### Steps
1. Navigate to `/events` (M02)
2. Click the "Create Event" button/CTA
3. Wait for the Create Event form (M14) to load

### Expected Result
- Create Event form renders without errors
- Form contains fields for event name, dates, venue/location, and other required event metadata
- All form fields are empty/default (not pre-filled with stale data)
- Cancel button is present and functional (returns to M02)
- Submit/Create button is present
- No console errors
- No loading state persists indefinitely

### Invariants Checked
- [x] INV-002: Form will validate with Zod on submission (tested in EVT-CREATE-002)
- [x] INV-008: Super Admin has write access to events

### Forbidden Behavior
- Form MUST NOT be pre-filled with another event's data
- Form MUST NOT allow submission without required fields (enforced by Zod)
- No JavaScript console errors on load

## Oracle Sources
- `research-hub/PROJECT_HANDOFF.md` — M14 Create Event screen, navigation graph: M02 -> create button -> M14
- `qa/oracle/navigation-graph.json` — flows.create_event_flow
- `qa/oracle/role-matrix.json` — events.super_admin.write = true

## Evidence Required
- [ ] Screenshot of Create Event form with all fields visible
- [ ] Console output (no errors)
- [ ] Network check (no failed API calls on form load)
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
