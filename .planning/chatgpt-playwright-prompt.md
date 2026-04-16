# Prompt for ChatGPT — Playwright Private Acceptance Specs

> Copy everything below the line into ChatGPT.
> Attach these files alongside the prompt:
>
> 1. `research-hub/USER_FLOWS.md`
> 2. `research-hub/CLICK_MAP_AND_TRACEABILITY.md`
> 3. `research-hub/FRONTEND_ARCHITECTURE.md` (sections 1-2 only: Route Map + Layout Hierarchy)
> 4. `research-hub/PROJECT_HANDOFF.md` (screen inventory table only — stop before "Tech Stack")
> 5. `wireframes/GEM-India-Final-48-Screens-v4.pdf`
> 6. `docs/TEST_GOVERNANCE.md`

---

## PROMPT START

You are a senior QA engineer writing **Playwright private acceptance specs** for a conference management web app called GEM India. These specs will be used as the hidden acceptance gate — the development AI agent will NEVER see them. Your job is to define WHAT to test, not HOW it's implemented.

### Context

GEM India is a mobile-first Next.js web app for managing Indian academic/medical conferences. It runs on port 4000. Authentication is handled by Clerk. The app has 4 roles:

| Role | Access |
|------|--------|
| Super Admin | Everything |
| Event Coordinator | Events, Program, Registration, Communications, Certificates |
| Ops | Travel, Accommodation, Transport only |
| Read-only | All visible, all write actions disabled (buttons grayed/disabled) |

### What I'm Attaching

1. **USER_FLOWS.md** — Complete user journeys as Mermaid flowcharts (auth, navigation, event lifecycle, registration, travel, accommodation, transport, program, certificates, communications, QR/attendance, reports, branding, team settings). This is your PRIMARY oracle.
2. **CLICK_MAP_AND_TRACEABILITY.md** — Every screen, every tappable element, and where it navigates to. Use this for navigation assertions.
3. **FRONTEND_ARCHITECTURE.md** — The route map (URL paths for every screen). Use this for `page.goto()` targets.
4. **PROJECT_HANDOFF.md** — Screen inventory mapping screen IDs to wireframe filenames.
5. **Wireframe PDF** — Visual reference for what each screen looks like.
6. **TEST_GOVERNANCE.md** — The testing philosophy. Read this to understand WHY these specs exist.

### Your Task

Produce **structured acceptance specs** (NOT Playwright code yet) for each module. One spec file per module. Cover these modules in this order:

1. Authentication (login, forgot password, reset, role-based landing)
2. Dashboard (metrics display, event switcher, quick actions)
3. Events (CRUD, event workspace hub, module navigation)
4. People (list, detail, CSV import, merge duplicates)
5. Sessions & Program (add/edit session, schedule grid, revision notifications)
6. Registration (public form, admin list, status management, capacity/waitlist)
7. Travel (records list, form, red flags)
8. Accommodation (list, form, room assignment, red flags)
9. Transport (planning, vehicle assignment kanban, batch management)
10. Communications (templates, triggers, send history)
11. Certificates (template editor, generation, bulk download)
12. QR & Attendance (scanner, manual check-in, attendance report)
13. Reports & Exports
14. Branding (letterheads)
15. Settings (team, roles, invites)

### Spec Format

For each module, produce a markdown file with this structure:

```markdown
# Module: [Name]

## Routes Tested
- List every URL path this module covers (from the route map)

## Preconditions
- What data/state must exist before tests run
- Which role(s) are being tested

## Acceptance Criteria

### AC-01: [Short descriptive name]
- **Given**: [precondition state]
- **When**: [user action — be specific: "clicks the '+ New' button", "fills the Email field with 'test@example.com'"]
- **Then**: [observable outcome — what the user SEES, not what happens internally]
- **Roles**: [which roles should succeed, which should be blocked]

### AC-02: ...
(continue)

## Negative Cases
### NC-01: [What should NOT work]
- **Given**: ...
- **When**: ...
- **Then**: [expected error message, disabled state, redirect, etc.]

## Cross-Module Integration
- List any behaviors that depend on or trigger changes in other modules
- Example: "Creating a registration should make the person appear in People list"

## Navigation Assertions
- For every screen in this module, list the expected navigation paths FROM and TO it
- Derived from the click map
```

### Rules You MUST Follow

1. **Derive all expectations from the attached documents ONLY.** Do not invent features, screens, or behaviors not shown in the wireframes or user flows.
2. **Be specific about UI text.** If the wireframe shows a button labeled "Save Session", use exactly that text — not "Submit" or "Save".
3. **Test BEHAVIOR, not implementation.** Never reference database tables, API endpoints, React components, or internal function names. Only describe what a user sees and does.
4. **Cover all 4 roles** for every write action. Super Admin and relevant role should succeed. Read-only should see disabled buttons. Wrong role should not see the menu item at all.
5. **Cover the sad paths.** Empty states, validation errors, duplicate submissions, expired links, full capacity, network-disconnected states (if shown in wireframes).
6. **Flag gaps.** If a user flow references a screen marked ⚠️ or 🔴 (incomplete/missing wireframe), note it as "SPEC GAP — screen not yet designed" rather than guessing.
7. **Don't assume implementation details.** If you don't know whether a form submits via AJAX or full-page navigation, describe the expected end state ("user sees success toast and is redirected to X") without specifying the mechanism.
8. **Mobile-first viewport.** Default specs assume 375×812 (phone). Flag any behaviors that would differ on tablet (768×1024) or desktop (1440×900).
9. **One module per response** if the context gets too long. I'll ask for the next one.

### Delivery

- Start with **Module 1: Authentication** and **Module 2: Dashboard** in your first response.
- Wait for my confirmation before proceeding to the next modules.
- After all 15 modules are done, I'll ask you to produce a **cross-module integration spec** that covers journeys spanning multiple modules (e.g., "register → appear in people → get assigned travel → receive certificate").

### What You Do NOT Have (and should NOT guess about)

- Database schema or table names
- API route implementations
- Component file names or code structure
- How state management works internally
- Which npm packages are used
- The existing test suite (this is intentionally hidden from you)

If something in the user flows or click map is ambiguous, call it out as an **AMBIGUITY** and propose two interpretations rather than picking one silently.

## PROMPT END
