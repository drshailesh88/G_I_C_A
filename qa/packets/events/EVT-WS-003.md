# QA Packet: EVT-WS-003

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-WS-003 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | READY |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-WS-003 |
| Description | Event Workspace enforces eventId isolation — data from other events is not visible |
| Route(s) | `/events/[id]` (M21) |
| Role | Super Admin (`org:super_admin`) |
| Type | Invariant / Event Isolation |

## Frozen Spec

### Preconditions
- Dev server running on port 4000
- User authenticated as Super Admin via Clerk
- At least TWO events exist in the database (Event A and Event B)
- Event A and Event B have distinguishable data (different names, different associated records)

### Steps
1. Navigate to Event A's workspace (`/events/[eventAId]`)
2. Wait for workspace to load
3. Note the event name, any summary data, module counts, or preview data visible
4. Navigate back to events list (M02)
5. Navigate to Event B's workspace (`/events/[eventBId]`)
6. Wait for workspace to load
7. Verify Event B's data is shown, NOT Event A's data
8. Use browser back to return to Event A's workspace
9. Verify Event A's data is shown again, not stale Event B data

### Expected Result
- Step 3: Event A's name and data are displayed
- Step 7: Event B's name and data are displayed. No remnant of Event A's data visible.
- Step 9: Event A's data is correctly restored. No bleed from Event B.
- Event-scoped workspace and module data requests must include or derive the active eventId and must not use a stale eventId after switching. Verify in network tab that requests after navigating to Event B do not reference Event A's eventId.
- No cross-event data leakage at any point

### Invariants Checked
- [x] INV-001: eventId filtering — the core invariant being tested
- [x] Event isolation rule EI-006: switching events reloads data for new eventId
- [x] Event isolation rule EI-002: no stale data from previous event context

### Forbidden Behavior
- Data from Event A MUST NOT appear while viewing Event B's workspace
- Data from Event B MUST NOT appear while viewing Event A's workspace
- API calls MUST NOT omit eventId parameter
- API calls MUST NOT use a cached/stale eventId after switching
- Client-side state MUST NOT retain previous event's data after navigation

### Future Hardening Notes
- **Multi-tab isolation**: Having Event A in one tab and Event B in another — verify no session/context state leakage across tabs. Deferred from pilot; does not block freeze.
- **Race condition on fast switching**: Clicking back to M02 and immediately selecting a new event before the first finishes loading. Deferred from pilot; does not block freeze.
- **EVT-WS-007 (DRAFT-FUTURE)**: Invalid/nonexistent eventId in URL — behavior when user types a non-existent eventId directly. Deferred from this pilot.

## Oracle Sources
- `qa/oracle/event-isolation-rules.json` — EI-001 through EI-007, especially EI-006
- `qa/oracle/product-rules.json` — INV-001: eventId filtering is the #1 invariant
- `AGENTS.md` — 'NEVER skip eventId filtering in any database query'

## Evidence Required
- [ ] Screenshot of Event A workspace showing Event A's name/data
- [ ] Screenshot of Event B workspace showing Event B's name/data
- [ ] Screenshot after back-navigation to Event A (data restored correctly)
- [ ] Network trace showing API calls with correct eventId for each workspace
- [ ] Console output (no errors during switching)
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
- Labels: `module:events`, `risk:critical`, `type:invariant`, `invariant:INV-001`

## History
| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| 2026-04-13 | Claude Code | Created DRAFT packet | — |
| 2026-04-13 | Claude Code | Amendment: Gemini 3.1 Pro critique — precise eventId wording, future hardening notes for multi-tab/race/invalid-eventId | — |
| 2026-04-13 | Codex PM | Frozen after Gemini 3.1 Pro re-critique returned FREEZE_READY | Re-critique command: `cat /tmp/gemini-recritique-prompt.md \| gemini -m gemini-3.1-pro-preview` |
