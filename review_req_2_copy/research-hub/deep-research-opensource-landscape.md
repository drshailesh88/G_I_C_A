# Open-source GitHub landscape for a medical and academic conference dashboard in India

## Context and evaluation rubric

Your product is effectively a “conference operations ERP” for Indian medical and academic conferences: multi-role back office, reusable contact master, scheduling across halls, faculty workflows, delegate registration and check-in, messaging, travel and stay logistics, certificates, and analytics across archives.

To keep the repo analysis consistent, I mapped everything against your module list (below) and prioritised repositories that are both (a) used by real conferences and (b) show evidence of ongoing maintenance via recent commits or releases (as visible on GitHub at the time of review). When I say “use directly”, I mean “legally plausible to ship in a closed-source commercial product” under typical permissive licensing; when I say “study patterns”, I mean “license is strong copyleft or otherwise awkward for proprietary SaaS unless you accept the obligations”.

Module map (your numbering preserved):

1. RBAC (super admin, event coordinator, operations, read-only)  
2. Master contact DB reusable across events with dedup  
3. Event creation with dynamic fields, multi-session, multi-hall scheduling  
4. Scientific program management (faculty roles across halls/time)  
5. Delegate registration with QR code assignment  
6. Faculty invitation and confirmation workflow  
7. Email notifications with per-event branding  
8. WhatsApp notifications with templates and delivery tracking  
9. Travel itinerary management (flights/PNR/attachments, personalised comms)  
10. Accommodation management (room assignment, rooming list exports, maps links)  
11. Transport/arrival planning (batching arrivals for vehicles)  
12. Certificate generation (template editor, bulk gen, email/WhatsApp delivery)  
13. QR attendance tracking with PWA scanner  
14. Dashboard metrics, exports, per-event archives  

## Systems to study for end-to-end conference workflows

**Indico** (designed at entity["organization","CERN","particle physics lab"])  
GitHub URL: `https://github.com/indico/indico` citeturn37search2turn2view0  
Stars: 2.1k. License: MIT. Tech stack: primarily Python with substantial JavaScript, plus smaller CSS/HTML/SCSS. Last meaningful commit: 2026-04-02. citeturn2view0turn11view0  
Modules covered (high confidence): 3 (core event structure), 4 (abstracts/papers workflow), 5 (registration), 14 (conference organisation workflow surface area). citeturn37search7turn37search2  
Use/adapt/study: **Use directly** (permissive MIT), but treat it as an architecture reference more than a codebase to fork, because your India-specific logistics stack (WhatsApp, travel, accommodation batching) is outside what Indico is optimised for. citeturn2view0turn37search7  

**pretalx**  
GitHub URL: `https://github.com/pretalx/pretalx` citeturn15view0turn16view0  
Stars: 891. License: the repo’s LICENSE file states AGPL-3.0; the README text also states “Apache License”, so treat this as **license ambiguity that must be resolved before reuse** by reading the current LICENSE in-repo and any dual-licensing notes. Last meaningful commit: 2026-04-05. citeturn0search1turn15view0turn16view0  
Tech stack: Python (Django ecosystem) with an embedded “schedule editor” front-end subtree (commits reference frontend dependencies), plus database-backed organiser workflows. citeturn15view0turn16view0  
Modules covered (high confidence): 3 (multi-track scheduling), 4 (programme content pipeline via CFP and reviewing), 6 (speaker communication workflow), 7 (organiser-to-speaker emailing), 14 (organiser admin surface). citeturn15view0turn16view0  
Use/adapt/study: **Mostly study patterns** for a proprietary SaaS unless you are willing to comply with AGPL obligations; if the Apache statement reflects a dual-license, confirm and then reassess. citeturn0search1turn15view0  

**frab**  
GitHub URL: `https://github.com/frab/frab` citeturn1view2turn14view2turn17search18  
Stars: 727. License: MIT. Tech stack: Ruby on Rails. Last meaningful commit: 2026-03-08. citeturn1view2turn14view2turn17search18  
Modules covered (high confidence): 3 (schedule), 4 (talks/speakers management), 6 (speaker management flows). citeturn17search8turn17search18  
Use/adapt/study: **Use directly** (MIT) for patterns, especially how Rails apps model “sessions”, “speakers”, “rooms”, and schedule generation; the project itself notes it is not in heavy feature expansion, so treat it more as a stable reference than a fast-moving base. citeturn1view2  

**Open Source Event Manager (OSEM)** by entity["organization","openSUSE","linux distribution project"]  
GitHub URL: `https://github.com/opensuse/osem` citeturn47view0turn14view3  
Stars: 911. License: MIT. Tech stack: Ruby/Rails (Ruby majority), with Haml and some JavaScript/SCSS. Last meaningful commit: 2026-03-25. citeturn47view0turn14view3  
Modules covered (grounded, but not exhaustively verified from README in this pass): 3 (conference scheduling is an explicit topic tag), 14 (full event manager surface implied by positioning as an event management tool tailored to conferences). citeturn47view0  
Use/adapt/study: **Use directly** (MIT) if you want a Rails reference for “conference ops admin” modelling with a conference-specific domain; for your stack, it is most valuable as a data model and workflow reference, not as a code transplant. citeturn47view0turn14view3  

## Ticketing, registration, and QR check-in

This category is where you will find the closest “already-done” implementations for modules 5, 7, 13, and parts of 14. It is also where licensing gets most restrictive, because “ticketing” is commercial.

**pretix**  
GitHub URL: `https://github.com/pretix/pretix` citeturn28view2turn14view0  
Stars: 2.4k. License: mostly AGPL v3 with additional terms (per repo’s license section). Tech stack: Django/Python with JavaScript and HTML. Last meaningful commit: 2026-04-02. citeturn28view2turn14view0  
Modules covered (high confidence): 5 (delegate/ticket registration), 13 (attendance scanning via companion apps), 14 (event dashboards and operational views typical of ticketing). citeturn28view2turn28view0  
Use/adapt/study: **Study patterns** for a closed-source SaaS unless you comply with AGPL. The architecture is still worth dissecting: stable data model for orders, attendees, check-in lists, and audit logs. citeturn28view2  

**pretixSCAN Desktop**  
GitHub URL: `https://github.com/pretix/pretixscan-desktop` citeturn28view0turn28view1  
Stars: 24. License: Apache-2.0. Tech stack: Kotlin (JVM desktop app) designed for attendee check-in for pretix-managed events. Last meaningful commit proxy: “Updated” 2026-04-02 (org repo listing). citeturn28view0turn28view1  
Modules covered (high confidence): 13 (scanner/check-in workflow). citeturn28view0  
Use/adapt/study: **Use directly** (Apache-2.0) if you want reference code for offline-tolerant scanning apps and sync strategies, even if you rebuild it as a PWA scanner. citeturn28view0  

**Hi.Events**  
GitHub URL: `https://github.com/HiEventsDev/Hi.Events` citeturn39view0turn38view0turn40view0  
Stars: 3.6k. License: AGPL-3.0 with additional terms, with commercial licensing offered. Tech stack: PHP + TypeScript + SCSS (language breakdown on GitHub). Last meaningful commit: 2026-03-02. citeturn39view0turn44search0turn40view0  
Modules covered (high confidence from feature list): 5 (custom checkout questions, ticketing), 13 (QR code check-in with scan logs and access-controlled check-in lists), 14 (search/filter/export, operational dashboards implicit in feature list), and partial 7 (bulk messaging by ticket type is explicitly listed, but channel specifics need verification). citeturn38view0  
Use/adapt/study: **Study patterns** unless you buy/qualify for commercial licensing or accept AGPL obligations. The feature list reads like an Eventbrite-alternative back office, which is unusually close to your operations dashboard needs. citeturn38view0turn44search0  

**Attendize**  
GitHub URL: `https://github.com/Attendize/Attendize` citeturn26view3turn27view0  
Stars: 4.2k. License: Attribution Assurance License (AAL). Tech stack: Laravel/PHP. Last meaningful commit: 2023-01-26. citeturn26view3turn27view0  
Modules covered (high confidence): 5 (ticketing/attendees), 7 (email workflows are a core part of ticketing and the project explicitly discusses organiser logo in email changes in commit history), 14 (standard reporting/management implied by ticketing platform scope). citeturn26view3turn27view0  
Use/adapt/study: **Study patterns** or **adapt cautiously**. AAL is not a standard permissive license; it is explicitly designed to enforce attribution and has commercial “white-label” options, so it can conflict with a commercial product that wants your own branding as the default. citeturn26view3  

**Open Event Server** (FOSSASIA)  
GitHub URL: `https://github.com/fossasia/open-event-server` citeturn5view0turn14view1  
Stars: 3k. License: GPL-3.0. Tech stack: Python with JavaScript and HTML. Last meaningful commit: 2024-03-25. citeturn5view0turn14view1  
Modules covered (high confidence, based on commit log context): 5 (ticketing identifiers such as ticket code), 13 (QR-related workflows appear in commit history), 14 (admin/export patterns typical for event server backends). citeturn14view1turn5view0  
Use/adapt/study: **Study patterns** for a proprietary SaaS because of GPL-3.0, but the backend object model for orders, attendees, sessions, and exports is still useful. citeturn5view0  

## Next.js and TypeScript codebases close to your stack

The repos here are not full “conference ops dashboards”, but they are unusually valuable for your exact stack choices (Next.js, TypeScript, Tailwind, and modern component patterns). They are best used to steal interaction patterns, data-shaping, and “admin UX” approaches.

**Virtual Event Starter Kit** by entity["company","Vercel","cloud platform"]  
GitHub URL: `https://github.com/vercel/virtual-event-starter-kit` citeturn32view0turn34view0  
Stars: 2.2k. License: MIT. Tech stack: TypeScript-heavy Next.js app with CSS (language breakdown on GitHub). Last meaningful commit: 2025-12-12. citeturn32view0turn34view0  
Modules covered (high confidence from README positioning): 3 (stages and schedule concept), 5 (registration and ticket generation), 14 (event site + back-end persistence patterns, though this is more attendee-facing than ops-facing). citeturn32view0turn34view0turn31search8  
Use/adapt/study: **Use directly** (MIT) for Next.js patterns at scale, especially: registration flows, storing registrations, and generating unique ticket artefacts. It is not a back-office dashboard, but its “conference-grade” product decisions are relevant. citeturn32view0turn30view0  

**AsyncAPI Conference Website** by entity["organization","AsyncAPI Initiative","event-driven api community"]  
GitHub URL: `https://github.com/asyncapi/conference-website` citeturn32view1turn35view0turn30view2  
Stars: 47 (slightly below your 50+ preference, but actively maintained). License: Apache-2.0. Tech stack: TypeScript-heavy Next.js project. Last meaningful commit: 2026-03-21. citeturn32view1turn35view0  
Modules covered (high confidence from PR description): 5 (attendee registration flow), 7 (confirmation email), plus consent capture patterns that matter in real medical conferences (explicit opt-ins and sponsor data-sharing flags). citeturn30view2turn35view0  
Use/adapt/study: **Use directly** (Apache-2.0) as a modern “conference registration flow” reference in Next.js, especially if you want strong consent capture and non-blocking email sending patterns. citeturn30view2turn32view1  

**Materio Next.js admin dashboard template**  
GitHub URL: `https://github.com/themeselection/materio-mui-nextjs-admin-template-free` citeturn30view3  
Stars: 1.9k. License: MIT. Tech stack: Next.js with TypeScript and Tailwind plus MUI (per repo description and language breakdown). Last meaningful public release: 2024-06-18. citeturn30view3  
Modules covered: 14 (dashboard UX primitives: layouts, charts, tables, filters). citeturn30view3  
Use/adapt/study: **Use directly** (MIT) for admin UX structure, but treat this as a UI shell, not a domain implementation. It is a fast way to test your “operations cockpit” information architecture before hardening your own shadcn/ui design system. citeturn30view3  

## Academic and paper-review oriented platforms

These are the closest matches to “medical and academic conferences” as a domain, because they foreground abstracts/papers, reviews, and proceedings.

**Leconfe**  
GitHub URL: `https://github.com/leconfe/leconfe` citeturn23view0turn25view0turn19view3  
Stars: 13 (niche, but very on-domain). License: GPL-3.0. Tech stack: Laravel/PHP with JS tooling (Vite is referenced in repo files). Last meaningful commit: 2026-04-04. citeturn23view0turn25view0turn19view3  
Modules covered (high confidence from README feature list): 3 (multiple conference series), 4 (paper submission workflow), 5 (participant registration and attendance), 14 (publisher-oriented workflows and proceedings context). citeturn23view0turn18view2  
Use/adapt/study: **Study patterns** unless you are willing to comply with GPL-3.0 in a commercial product; its value is in modelling academic workflows end-to-end, not in being a codebase you fork into a proprietary SaaS. citeturn23view0turn25view0  

**Open Conference Systems (OCS)** (Public Knowledge Project ecosystem)  
GitHub URL: `https://github.com/pkp/ocs` citeturn5view3  
Stars: 96. License: GPL-1.0 (per GitHub repo metadata). Tech stack: PHP. Last meaningful commit date: not assessed in this pass, so treat maintenance status as **unknown** without further verification. citeturn5view3  
Modules covered (domain inference from positioning as scholarly conference web presence tool): 3 (conference web presence), 4 (scholarly workflows), 14 (conference site + admin). citeturn5view3  
Use/adapt/study: **Study patterns** due to GPL and unknown maintenance state; its main value is understanding “conference proceedings” and scholarly publishing assumptions. citeturn5view3  

**Wafer**  
GitHub URL: `https://github.com/ctpug/wafer` citeturn18view0turn22view0  
Stars: 61. License: ISC. Tech stack: Django/Python with HTML/JS. Last meaningful commit: 2026-03-27. citeturn18view0turn22view0  
Modules covered (high confidence from feature list): 3 (schedule editor), 4 (talk submissions, review, acceptance), 14 (static archive generation explicitly supported). citeturn18view0turn22view0  
Use/adapt/study: **Use directly** (ISC) if you want a compact Django reference for programmes and schedule editing. It is small enough to read end-to-end, which is rare among conference systems. citeturn18view0  

**Symposion**  
GitHub URL: `https://github.com/pinax/symposion` citeturn19view1turn20view0  
Stars: 303. License: BSD-3-Clause. Tech stack: Django/Python with JavaScript. Last meaningful commit: 2018-06-12. citeturn19view1turn20view0  
Modules covered (conceptually): 3 and 4, but the maintenance gap makes it risky as a template for modern production. citeturn20view0turn19view1  
Use/adapt/study: **Study patterns only**. Its primary value is historical: how older Django conference stacks modelled proposals, speakers, and schedules. citeturn20view0  

## Licensing reality check for a commercial product

The fastest way to burn months is to build on code you cannot legally ship.

Permissive licenses that generally allow “use directly” in a proprietary SaaS, with attribution/notice obligations: MIT, Apache-2.0, BSD-3-Clause, ISC. You have strong options here: Indico (MIT), frab (MIT), OSEM (MIT), Vercel virtual-event-starter-kit (MIT), Materio template (MIT), AsyncAPI conference website (Apache-2.0), Wafer (ISC). citeturn2view0turn1view2turn47view0turn32view0turn30view3turn32view1turn18view0  

Strong copyleft licenses that usually push you toward “study patterns” unless you accept open-sourcing obligations: GPL and AGPL families. These appear on several of the most feature-rich “conference + ticketing” back offices: pretix (AGPL with additional terms), Hi.Events (AGPL with additional terms and commercial licensing), Open Event Server (GPL-3.0), Leconfe (GPL-3.0), and pretalx (LICENSE indicates AGPL-3.0, with a README statement that needs reconciliation). citeturn28view2turn38view0turn5view0turn23view0turn0search1turn15view0  

“Open source but with commercial friction”: Attendize’s Attribution Assurance License and its explicit positioning around paid support and white-label licensing makes it a poor base for a branded SaaS unless you are comfortable with its attribution and licensing constraints. citeturn26view3turn27view0  

Your highest-leverage pattern, given your India-specific modules (WhatsApp templates and tracking, travel and stay logistics, vehicle batching, certificates): use a permissive conference core (Indico, OSEM, or frab patterns) as architecture reference, then design your own modular back-office around a clean Postgres domain model. If you try to fork a copyleft ticketing system as your product core, you will either (a) inherit licensing obligations you likely do not want, or (b) spend effort rewriting large parts anyway to fit Indian on-ground ops. This conclusion is driven by the license posture and scope focus visible in the repos above, not by speculation about your requirements. citeturn28view2turn38view0turn5view0turn23view0turn47view0turn2view0