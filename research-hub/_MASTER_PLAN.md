# G_I_C_A — Master Research Plan

> Maintained by the Master Coordinator. Workers execute; Master synthesizes.

## Mission

Research and evaluate event/conference management platforms to inform the architecture of the **GEM India Conference App (G_I_C_A)**. Each worker investigates one platform deeply, producing structured findings that feed into our build-vs-adopt decision.

## Research Objectives (All Workers)

Every worker must answer these questions for their assigned platform:

### A. Platform Overview
- What is it? Who maintains it? License?
- How mature is it? (age, releases, community size)
- Tech stack (backend, frontend, database, APIs)

### B. Core Features
- Event/conference creation and management
- Call for Papers / Abstract submission
- Review & selection workflow
- Schedule/timetable management
- Speaker management
- Registration & ticketing
- Multi-track / multi-day support

### C. India-Specific Fit
- Localization / multi-language support
- Payment gateway integration (Razorpay, UPI, etc.)
- Mobile responsiveness / PWA / native app
- Offline capability (for low-connectivity venues)
- Scalability for large events (1000+ attendees)

### D. Extensibility
- Plugin/extension architecture
- API completeness (REST/GraphQL)
- Customization difficulty (theming, branding)
- Self-hosting requirements and complexity

### E. Gaps & Risks
- What's missing for our use case?
- Known limitations or deal-breakers
- Community health / risk of abandonment

## Worker Assignments

| Worker | Platform | Focus |
|--------|----------|-------|
| **1 — Indico** | [Indico](https://getindico.io) | CERN's system. Strong in academic conferences. Evaluate for scientific event workflows. |
| **2 — Pretalx** | [Pretalx](https://pretalx.com) | CfP + scheduling. Popular in tech conferences. Evaluate submission/review pipeline. |
| **3 — Hi!Events** | [Hi!Events](https://hi.events) | Modern, open-source. Evaluate registration, ticketing, and UX. |
| **4 — Frab** | [Frab](https://frab.github.io/frab/) | Conference planning & scheduling. Evaluate schedule management features. |
| **5 — Commercial** | Hopin, Cvent, Whova, Townscript, Airmeet, etc. | Survey commercial options. Focus on India-market platforms and pricing. |

## Output Format (Per Worker)

Each worker writes to their folder:
```
/research-hub/worker-N-name/
  platform-overview.md      ← sections A-E above
  feature-matrix.md         ← structured feature checklist
  screenshots/              ← key UI screenshots (optional)
  api-notes.md              ← API documentation findings
  verdict.md                ← recommendation summary
```

## Synthesis Plan (Master)

Once all workers report **done**:
1. Build a unified comparison matrix
2. Identify the best base platform (or confirm custom build)
3. Map platform features to G_I_C_A modules
4. Produce `/research-hub/FINAL_SYNTHESIS.md`

## Current Phase

**Phase 1: Research** — Workers dispatched, awaiting results.

---
*Last updated by Master Coordinator: 2026-04-05*
