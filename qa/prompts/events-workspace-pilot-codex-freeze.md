# Codex PM Prompt — Freeze Events/Workspace Pilot Packets

## System Context

You are the PM and oracle owner for GEM India QA. Your role is defined in `qa/AGENT_ROLES.md` and `qa/templates/CODEX_PM_REVIEW_PROMPT.md`.

You are reviewing 8 DRAFT QA packets for the Events/Workspace pilot module. Your job is to:
1. Review each packet for oracle accuracy
2. Verify PM decisions from 2026-04-13 are correctly applied
3. Freeze approved packets (change status from DRAFT to READY)
4. Reject or request changes for packets that need work

## PM Decisions Already Applied (2026-04-13)

The following decisions have been applied to the packets and oracle. Verify they are correctly reflected:

1. **Ops event access**: Ops may use active event context shell only to reach Travel/Accommodation/Transport. Ops must not access Events CRUD.
2. **Read-only create forms**: Render form in read-only/disabled mode with clear notice. Server-side mutation attempts blocked.
3. **Event creation required fields**: Event name, start date, end date, venue name. Description, address/city/map URL, module toggles are optional.
4. **Date range validation**: End date before start date rejected server-side before persistence. Client-side validation desirable but not sufficient.
5. **Duplicate notification response**: No second notification dispatches; exact response is module-specific. (Not blocking events pilot.)
6. **Phone default region**: Unresolved; not relevant to Events/Workspace freeze.

## Oracle Sources (Priority Order)

1. Explicit PM decisions (from human) — **including the 2026-04-13 decisions above**
2. `AGENTS.md` — Critical Rules, Roles, Module Boundaries
3. `research-hub/DESIGN_DECISIONS.md` — Locked decisions
4. `research-hub/PROJECT_HANDOFF.md` — Wireframes, navigation graph, build order
5. `research-hub/BACKEND_ARCHITECTURE_MAP.md` — Architecture, libraries, data model
6. `research-hub/DEFERRED_TICKETS.md` — Items requiring design before build
7. `qa/oracle/*.json` — Machine-readable oracle files (amended 2026-04-13)
8. Current implementation is NOT oracle — discovery only

## Packets to Review

Read each packet file, then for each one:

### 1. EVT-LIST-001 (`qa/packets/events/EVT-LIST-001.md`)
- Events list happy path for Super Admin
- No PM decisions to verify — check oracle accuracy and invariants

### 2. EVT-LIST-003 (`qa/packets/events/EVT-LIST-003.md`)
- Navigation from events list to workspace
- Check navigation flow per PROJECT_HANDOFF.md

### 3. EVT-CREATE-001 (`qa/packets/events/EVT-CREATE-001.md`)
- Create Event form load
- Verify form fields match PM decision: name, start date, end date, venue name (required)

### 4. EVT-CREATE-002 (`qa/packets/events/EVT-CREATE-002.md`)
- Create Event Zod validation — **AMENDED**
- Verify: required fields = name, start date, end date, venue name
- Verify: end-before-start rejected server-side

### 5. EVT-CREATE-006 (`qa/packets/events/EVT-CREATE-006.md`)
- Role enforcement — **AMENDED**
- Verify: Ops cannot access Events CRUD
- Verify: Read-only sees disabled form with notice

### 6. EVT-WS-001 (`qa/packets/events/EVT-WS-001.md`)
- Workspace happy path for Super Admin
- Check expected module links are complete

### 7. EVT-WS-003 (`qa/packets/events/EVT-WS-003.md`)
- EventId isolation test
- Check two-event switching test sufficiency

### 8. EVT-WS-006 (`qa/packets/events/EVT-WS-006.md`)
- Workspace role enforcement — **AMENDED**
- Verify: Option B frozen — Ops accesses event context shell with Travel/Accommodation/Transport only
- Verify: Events CRUD hidden from Ops
- Verify: Read-only sees all modules, write disabled

## Your Output

For each packet, produce:

```yaml
packet_id: EVT-XXX-NNN
review_decision: FREEZE | REVISE | ESCALATE
reasoning: "..."
pm_decisions_correctly_applied: true | false
pm_decision_issues: "..." (if false)
spec_changes_required:
  - "..." (if REVISE)
invariants_verified: true | false
concerns: "..."
```

After reviewing all 8 packets:

```yaml
pilot_readiness: READY | BLOCKED
blocked_by: ["list of unresolved items"]
packets_frozen: ["list of frozen packet IDs"]
packets_needing_revision: ["list"]
packets_escalated: ["list"]
```

## Gemini 3.1 Pro Critique Applied (2026-04-13)

The following critique items from Gemini 3.1 Pro (`gemini -m gemini-3.1-pro-preview`) have been applied to the packets:
- **EVT-CREATE-002**: Server-side bypass check, XSS/SQLi payload tests, strengthened evidence
- **EVT-CREATE-006**: Server-side bypass checks for Ops and Read-only, disabled button inertness check
- **EVT-WS-006**: Mandatory server-side bypass checks for Ops (direct URL + API) and Read-only (mutation API)
- **EVT-LIST-001**: "Reasonable load time" replaced with 5-second threshold; future packet notes added
- **EVT-LIST-003**: "No infinite spinner" replaced with 5-second explicit timeout
- **EVT-WS-003**: Precise eventId wording; future hardening notes for multi-tab/race/invalid-eventId
- **Governance**: Gemini model policy added to AGENT_ROLES.md, evaluator template, and critique prompt
- **Evidence**: Server-side bypass evidence requirements added to EVIDENCE_REQUIREMENTS.md

Verify these amendments are correctly reflected before freezing.

## Anti-Cheat Checks

Before freezing any packet:
- [ ] Spec does NOT reference implementation code as source of truth
- [ ] Expected results are derived from oracle documents, not guessed
- [ ] Invariants cited actually apply to this checkpoint
- [ ] PM decisions from 2026-04-13 are correctly reflected
- [ ] Evidence requirements are complete and verifiable
- [ ] Forbidden behavior section covers known failure modes
- [ ] role-matrix.json amendments are consistent with packet specs

## Rules

- You may NOT weaken a spec without SPEC-BUG justification citing oracle sources
- You may NOT freeze a packet with unresolved NEEDS_HUMAN_DECISION items that affect this pilot
- You may NOT derive expected behavior from current implementation code
- You MUST cite oracle sources for every decision
- You MUST update `qa/LOOP_STATE.json` status for each packet you freeze (DRAFT -> READY)
