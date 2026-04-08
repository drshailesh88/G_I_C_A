# Adversarial Review Prompt — Paste Into Any LLM

> This prompt is self-contained. Everything referenced lives in the repo at /Users/shaileshsingh/G_I_C_A/
> No conversation context needed.

---

## Your Role

You are an adversarial reviewer hired to find every flaw in a conference management app design BEFORE code is written. Be ruthless. The team that designed this will defend their work — your job is to break it.

## The Project

GEM India — a mobile-first web app for managing Indian medical/academic conferences end-to-end: events, scientific programs, registration, travel, accommodation, transport, certificates, communications (Email + WhatsApp), QR check-in, and reporting.

## Files to Read (in order)

### 1. Client Requirements (SOURCE OF TRUTH)
`/Users/shaileshsingh/Downloads/document_pdf.pdf`
5 pages, 19 sections. Every bullet point is a contractual requirement.

### 2. Design Decisions (what the team locked)
`research-hub/DESIGN_DECISIONS.md`
Tech choices: Evolution API (WhatsApp), Inngest (background jobs), pdfme (certificates), Novu (notifications), shadcn-table (data tables), Clerk (auth). UX choices: 3-state red-flag cascade, mobile schedule auto-switch, Paytm-inspired colors.

### 3. Gap Analysis (their claim that everything is covered)
`research-hub/COMPLETE_GAP_ANALYSIS.md`
Maps every PDF requirement → UX pattern source → tech library. Claims "all 14 modules fully solved."

### 4. User Flows (every click path)
`research-hub/USER_FLOWS.md`
15 Mermaid flow diagrams covering auth, events, people, program, registration, travel, accommodation, transport, certificates, communications, QR scanner, reports, settings, and public pages.

### 5. Wireframe Audit (their self-critique)
`research-hub/WIREFRAME_AUDIT.md`
Lists what was missing after the first 16 screens. Claims 34 screens now cover everything.

### 6. Wireframe Images (the actual designs)
`research-hub/wireframes/*.png` — 34 mobile-first screens at 2x resolution
`research-hub/wireframes/GEM-India-Complete-34-Screens-v2.pdf` — combined PDF

### 7. Research Reports (library recommendations)
`research-hub/deep-research-opensource-landscape.md` — open-source conference tools survey
`research-hub/deep-research-toolkit-recommendations.md` — specific library picks per module

### 8. UX Research (what patterns they copied)
`research-hub/FINAL_SYNTHESIS.md` — synthesis of 14 platform teardowns
`research-hub/ux-teardowns/session-*/web-research.md` — per-platform research (14 files)
`research-hub/ux-teardowns/session-*/chrome-teardown.md` — interactive teardowns (3 files: Sessionize, Lu.ma, Certifier)

## What to Check

### A. Missing Requirements
Go through PDF sections 1-19 line by line. Every bullet must map to a wireframe screen AND a tech implementation. Flag anything with no screen or no tech path.

### B. Contradictions
PDF says X but design does Y. PDF says "dynamic ON/OFF fields aligned to client Excel" — does Create Event screen show Excel-like field config? PDF says "radio, dropdowns, text/date/time, uploads" — does Add Session Form have all these field types?

### C. Broken User Flows
Walk each Mermaid diagram. Can the user actually navigate from A→B→C? Are there dead ends? Can the Ops role reach their screens? Can a Read-only user see the program but not edit?

### D. UX Problems on Mobile
These screens will be used by Indian conference organizers on phones. Are forms too long? Are tap targets too small? Is text readable? Is the bottom tab bar blocking content? Are there screens with no back button?

### E. Cross-Module Cascade Gaps
Travel changes must trigger: (1) transport recalculation, (2) accommodation red-flag, (3) delegate notification. Is this fully designed? What about: accommodation change → transport impact? Registration cancellation → release room + release transport slot?

### F. Role-Based Access Missing
4 roles: Super Admin, Event Coordinator, Ops, Read-only. The wireframes show ONE version of each screen. Where are the role-restricted versions? Does the Ops user see the More menu the same way as Super Admin?

### G. PDF Section 7 (Communications) — Automation Triggers
PDF says: "Triggers: create/update event, assign responsibilities, travel saved, accommodation saved, certificate generated → personalised Email + WhatsApp." Is there a trigger configuration screen? Or is this hardcoded? The wireframes show a template editor but no trigger management.

### H. PDF Section 4 (Event Management) — Versioning
"versioning for edits; revised-responsibility mailers to faculty when program changes." Where is version history? Where is the diff view showing what changed?

### I. PDF Section 13 (Reporting) — Per-Event Archive
"Per-event archive of PDFs & communications." The Reports screen shows exports but no archive browser for past events.

### J. India-Specific
- Payment: PDF mentions nothing about payment in registration. But Research says Razorpay/UPI. Is payment in scope or not?
- Offline QR: PDF says "lightweight PWA for crew phones." Research flagged "unreliable venue WiFi." Is offline scanning designed?
- Bulk registration: Indian conferences have institutional group registrations. Is this supported?

## Output Format

Write to: `research-hub/ADVERSARIAL_REVIEW.md`

```markdown
# Adversarial Review — GEM India Conference App

## 1. CRITICAL ISSUES (must fix before coding)
For each: what's wrong, which PDF section, suggested fix.

## 2. IMPORTANT ISSUES (should fix, will cause problems)
Same format.

## 3. MINOR ISSUES (nice to fix, won't block)
Same format.

## 4. THINGS DONE WELL
Acknowledge what's solid so the team knows what NOT to change.
```

Be specific. Cite PDF section numbers. Reference wireframe screen names (M01, M22, etc.). Don't be vague — "the design could be better" is useless. "M23 Add Session Form is missing a file upload field for presentation slides, which PDF Section 4 requires via 'Attachments: agenda/Excel uploads'" is useful.
