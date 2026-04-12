# QA Packet: EVT-WS-007

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-WS-007 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | DRAFT-FUTURE |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-WS-007 |
| Description | Event Workspace behavior with invalid/nonexistent eventId in URL |
| Route(s) | `/events/[id]` (M21) |
| Role | Super Admin (`org:super_admin`) |
| Type | Edge Case / Error Handling |

## Notes

This is a DRAFT-FUTURE placeholder created from Gemini 3.1 Pro critique of EVT-WS-001 and EVT-WS-003.

**Not included in the first pilot queue.** Do NOT add to LOOP_STATE.json until spec is written and reviewed.

### Expected Behavior (to be specified)
- Navigate directly to `/events/99999` (valid format, nonexistent record) — expected: 404 page or redirect to M02, not a crash or blank page
- Navigate directly to `/events/invalid-id` (malformed format) — expected: 404 or redirect, not a crash
- Navigate directly to `/events/<script>alert(1)</script>` — expected: no XSS execution, 404 or redirect
- Navigate directly to `/events/' OR '1'='1` — expected: no SQL behavior, 404 or redirect

### Oracle Sources (to be checked)
- `qa/oracle/navigation-graph.json` — error handling for invalid routes
- `qa/oracle/event-isolation-rules.json` — behavior when eventId is invalid
- PM decision may be needed for exact error UX (404 page vs redirect to M02)

## History
| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| 2026-04-13 | Claude Code | Created DRAFT-FUTURE placeholder from Gemini 3.1 Pro critique | — |
