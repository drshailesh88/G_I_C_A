# QA Packet: EVT-LIST-006

| Field | Value |
|-------|-------|
| PACKET_ID | EVT-LIST-006 |
| MODULE | events |
| DATE | 2026-04-13 |
| STATUS | DRAFT-FUTURE |

## Checkpoint

| Field | Value |
|-------|-------|
| ID | EVT-LIST-006 |
| Description | Events list organization/tenant isolation — events from other orgs are not visible |
| Route(s) | `/events` (M02) |
| Role | Super Admin (`org:super_admin`) |
| Type | Invariant / Tenant Isolation |

## Notes

This is a DRAFT-FUTURE placeholder created from Gemini 3.1 Pro critique of EVT-LIST-001.

**Not included in the first pilot queue.** Do NOT add to LOOP_STATE.json until spec is written and reviewed.

### Expected Behavior (to be specified)
- Events from Organization A MUST NOT appear when logged into Organization B
- Verify Clerk org-level scoping applies to the events list query
- Negative test: seed events for two orgs, verify cross-org leakage does not occur

### Oracle Sources (to be checked)
- `AGENTS.md` — Multi-tenant/org isolation rules (if specified)
- `qa/oracle/event-isolation-rules.json` — eventId isolation (related but distinct from org isolation)
- PM decision needed: is org-level isolation an explicit requirement or implicit from Clerk?

## History
| Timestamp | Agent | Action | Disposition |
|-----------|-------|--------|-------------|
| 2026-04-13 | Claude Code | Created DRAFT-FUTURE placeholder from Gemini 3.1 Pro critique | — |
