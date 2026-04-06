# Click Map + UX Traceability Audit — Codex Prompt

> Self-contained. Everything referenced lives in the repo at /Users/shaileshsingh/G_I_C_A/
> No conversation context needed.

---

## Your Role

You are a UX verification engineer. Your job is to audit 43 mobile wireframe screens and produce a complete Click Map + UX Traceability document. You are checking for correctness, not designing anything new.

## The Project

GEM India — a mobile-first conference management app with 43 wireframe screens designed in Pencil. The screens cover auth, dashboard, events, people, scientific program, registration, communications, travel, accommodation, transport, certificates, QR scanning, reports, branding, and team management.

## Files to Read

### 1. Screen Inventory (know what exists)
Read `research-hub/WIREFRAME_AUDIT.md` — lists all designed screens with IDs.
Also read `research-hub/USER_FLOWS.md` — 15 Mermaid flow diagrams (written before all screens existed, may be outdated).

### 2. The Actual Wireframe Images (the source of truth for buttons)
All PNGs in: `research-hub/wireframes/*.png`
These are the 43 screens. Each filename is a node ID. You need to map IDs to screen names using the audit file.

The screens are (in order):
```
AUTH:
M16 — Login (DkS7G.png)
M17 — Forgot Password (a62TV.png)
M59 — Reset Password (mQxoB.png)

MAIN TABS:
M01 — Dashboard Home (f3KPo.png)
M02 — Events List (fCOC4.png)
M03 — People List (G2rDe.png)
M04 — Scientific Program Attendee (oRvH5.png)
M08 — More Menu (w8SrX.png)

EVENT MANAGEMENT:
M14 — Create Event (1isf8.png)
M22 — Session Manager (Gaavt.png)
M23 — Add Session Form (CpuHI.png)
M30 — Admin Schedule Grid (fooPM.png)
M51 — Event Field Builder (ZpAv1.png)
M52 — Version History / Program Changes (VHcOm.png)

PEOPLE:
M09 — Person Detail (waUUL.png)
M32 — CSV Import Column Mapping (TCWwB.png)
M57 — Merge Duplicates (9GInC.png)

REGISTRATION:
M07 — Registration Form (3IR5p.png)
M25 — Event Landing Page (qpTp8.png)
M28 — Registration Success (P5jNY.png)
M29 — Registration Admin (JIykr.png)
M26 — Faculty Invitation (WVLsf.png)
M55 — Faculty Confirm Participation (jlDVA.png)

COMMUNICATIONS:
M13 — Communications (1fB7u.png)
M39 — Template Editor (FGhXX.png)
M53 — Automation Triggers (LG8tQ.png)

LOGISTICS:
M06 — Travel Info Form (t7kqa.png)
M35 — Travel Records List (RSElF.png)
M05 — Accommodation + Flags (92NPy.png)
M36 — Accommodation Form (IMpCm.png)
M10 — Transport Planning (H25vw.png)
M38 — Vehicle Assignment Kanban (5FfEr.png)

CERTIFICATES:
M12 — Certificate Generation (Y3HLt.png)
M56 — Certificate Template Editor (nZ08H.png)

QR & ATTENDANCE:
M11 — QR Scanner (wLTrF.png)
M44 — Scan Success (9HWwn.png)
M45 — Scan Duplicate (SCufz.png)
M46 — Manual Check-in (WoR84.png)
M58 — Attendance Report (YBvs4.png)

SETTINGS & REPORTS:
M15 — Branding (xFRfv.png)
M19 — Team & Roles (sbLsV.png)
M47 — Reports & Exports (i8T1g.png)
M54 — More Menu Ops Role (IWTdp.png)
```

### 3. UX Research Sources (for traceability)
Read: `research-hub/FINAL_SYNTHESIS.md` — maps every module to a researched UX pattern source.
Read: `research-hub/DESIGN_DECISIONS.md` — locked UX decisions with source attribution.

### 4. PDF Requirements
Read: `/Users/shaileshsingh/Downloads/document_pdf.pdf` — the client spec.

## YOUR TASKS

### Task 1: Click Map (Screen Connection Audit)

For EVERY screen (M01 through M59), list:

```markdown
### M01 — Dashboard Home
**Entry points:** (how do you reach this screen?)
- App launch after login → lands here
- Tab bar: HOME tab (active)

**Tappable elements → Destination:**
| Element | Destination Screen | Notes |
|---------|-------------------|-------|
| Event selector dropdown | Event picker (not a screen — inline dropdown) | |
| Metric card "Delegates" | M03 People List (filtered to delegates) | |
| Metric card "Faculty" | M03 People List (filtered to faculty) | |
| Quick Action: Create Event | M14 Create Event | |
| Quick Action: Import People | M32 CSV Import | |
| Quick Action: Reports | M47 Reports & Exports | |
| Bell icon | Notification list (NOT DESIGNED — flag as missing) | |
| Avatar | Profile/settings (NOT DESIGNED — flag as missing) | |
| Tab: EVENTS | M02 Events List | |
| Tab: PEOPLE | M03 People List | |
| Tab: PROGRAM | M04 Scientific Program | |
| Tab: MORE | M08 More Menu | |
```

Do this for ALL 43 screens. Be exhaustive. Every button, every card, every chevron, every link.

### Task 2: Dead End Detection

After completing the click map, identify:

**Dead ends** — buttons/actions that lead to a screen that doesn't exist:
```markdown
| Screen | Element | Expected Destination | Status |
|--------|---------|---------------------|--------|
| M01 | Bell icon | Notification list | ❌ NO SCREEN |
| M01 | Avatar | Profile page | ❌ NO SCREEN |
```

**Orphan screens** — screens that no button on any other screen leads to:
```markdown
| Screen | Issue |
|--------|-------|
| M54 — Ops Role More | Only shown when logged in as Ops — not reachable from admin flow |
```

### Task 3: UX Traceability Matrix

For EVERY screen, trace its UX pattern back to a specific research source. Prove we didn't invent anything.

```markdown
| Screen | Primary UX Pattern | Research Source | Specific Reference |
|--------|-------------------|----------------|-------------------|
| M01 Dashboard | Event selector + metrics + quick actions | Whova dashboard + Retool admin | FINAL_SYNTHESIS.md Module 13 |
| M03 People List | Tabular list + filter chips + contact cards | HubSpot CRM | session-04-hubspot-crm/web-research.md |
| M30 Schedule Grid | Two-panel hall×time grid | Sessionize | session-02-sessionize/chrome-teardown.md |
| M05 Accommodation Flags | 3-state red/yellow/cleared | DESIGN_DECISIONS.md (custom, adapted from AppCraft) | Approved decision, not pure research |
```

Flag any screen where the UX pattern is NOT traceable to research:
```markdown
| Screen | Pattern | Source | ⚠️ Issue |
|--------|---------|--------|----------|
| M51 Event Fields | Drag-reorder toggles | ??? | No direct research source — may be invention |
```

### Task 4: Flow Completeness Check

Walk through these critical user journeys end-to-end and verify every step has a screen:

1. **New user onboarding:** Login → Dashboard → Create Event → Add Sessions → Build Schedule → Send Faculty Invitations
2. **Delegate registration:** Event Landing → Register → Success → QR Code
3. **Faculty invitation:** Invite Faculty → Email sent → Faculty clicks link → Confirm → Admin sees status
4. **Travel lifecycle:** Add Travel → Save & Send → Travel change → Red flag on accommodation → Ops reviews → Resolves
5. **Certificate lifecycle:** Choose Template → Edit Template → Select Recipients → Generate → Send → Delegate downloads
6. **QR check-in day:** Open Scanner → Scan → Success / Duplicate / Manual fallback → View attendance report
7. **Program revision:** Edit session → Version history shows change → Preview revised emails → Publish & send

For each journey, output:
```markdown
### Journey: Delegate Registration
Step 1: M25 Event Landing → tap "Register" → M07 Registration Form ✅
Step 2: M07 → fill form → submit → M28 Registration Success ✅
Step 3: M28 → email sent with QR → (email, not a screen) ✅
Step 4: Admin views → M29 Registration Admin → sees new entry ✅
VERDICT: ✅ COMPLETE
```

Or:
```markdown
### Journey: Certificate Lifecycle
Step 1: M12 Certificate Gen → tap template → M56 Certificate Editor ✅
Step 2: M56 → save → back to M12 ✅
Step 3: M12 → select recipients → tap Generate → ??? ❌ NO GENERATION PROGRESS SCREEN
Step 4: ??? → certificates sent → ??? ❌ NO ISSUED CERTIFICATES LIST
VERDICT: ❌ INCOMPLETE — missing generation progress and issued list
```

## OUTPUT

Write everything to: `research-hub/CLICK_MAP_AND_TRACEABILITY.md`

Sections:
1. Click Map (all 43 screens)
2. Dead Ends (buttons leading nowhere)
3. Orphan Screens (unreachable screens)
4. UX Traceability Matrix (every screen → research source)
5. Flow Completeness (7 critical journeys)
6. Summary: total dead ends, total orphans, total untraceable patterns, total incomplete journeys
