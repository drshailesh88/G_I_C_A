# GEM India — Conference Management Platform

Next.js 16 + Clerk + Drizzle ORM + Neon (Postgres) + shadcn/ui + Tailwind CSS.
Monorepo. App Router. TypeScript strict mode.

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## Critical Rules

### Never Do These
- NEVER modify files outside the module you were asked to work on.
- NEVER delete existing tests.
- NEVER change the database schema without explicit instruction.
- NEVER hardcode API keys, tokens, secrets, or credentials. Use environment variables.
- NEVER use `dangerouslySetInnerHTML` or raw SQL string interpolation.
- NEVER skip `eventId` filtering in any database query. Every query must scope to the active event.
- NEVER modify shared utilities in `lib/` without being explicitly asked.

### Always Do These
- Dev server runs on **port 4000** (`PORT=4000 npm run dev`). Never use 3000.
- Every API route validates input with Zod before processing.
- Every database query filters by `eventId` (per-event data isolation).
- Every mutation to travel/accommodation/transport writes to the audit log.
- Every notification send checks the idempotency key in Redis before sending.
- Phone numbers are normalized to E.164 on input using `libphonenumber-js`.
- Timestamps stored in UTC, displayed in IST using `date-fns-tz`.
- File upload max: 20MB.

## Architecture — Read Before Building

Detailed architecture, module-to-library mapping, and data model:
-> `research-hub/BACKEND_ARCHITECTURE_MAP.md`

Locked design decisions (do not revisit):
-> `research-hub/DESIGN_DECISIONS.md`

All 48 wireframes and screen navigation graph:
-> `research-hub/PROJECT_HANDOFF.md`

Deferred items that need design before their module ships:
-> `research-hub/DEFERRED_TICKETS.md`

## Module Boundaries

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Login, forgot password, reset
│   ├── (dashboard)/        # Admin screens (requires Clerk auth)
│   │   ├── events/         # M02, M14, M21 Event workspace
│   │   ├── people/         # M03, M09, M32 People + import
│   │   ├── program/        # M22, M23, M30 Sessions + schedule grid
│   │   ├── registration/   # M29 Admin list
│   │   ├── travel/         # M35, M06 Travel records
│   │   ├── accommodation/  # M05, M36 Accommodation + flags
│   │   ├── transport/      # M10, M38 Arrival + kanban
│   │   ├── communications/ # M13, M39, M53 Templates + triggers
│   │   ├── certificates/   # M12, M56, M61 Generate + editor
│   │   ├── qr/             # M11, M44-M46, M58 Scanner + attendance
│   │   ├── reports/        # M47 Exports
│   │   ├── branding/       # M15 Letterheads
│   │   └── settings/       # M19 Team + roles
│   └── (public)/           # M25 Landing, M07 Registration, M55 Faculty confirm
├── lib/
│   ├── db/                 # Drizzle schema, queries, migrations
│   ├── notifications/      # ONE service — email + WhatsApp abstracted
│   ├── auth/               # Clerk helpers, permission checks
│   ├── cascade/            # Inngest event definitions + handler functions
│   └── utils/              # Shared helpers (phone, date, file upload)
├── components/
│   ├── ui/                 # shadcn/ui primitives (do not edit directly)
│   └── shared/             # App-level shared components
└── emails/                 # React Email templates
```

When building a module, stay inside its directory. If you need shared functionality, check `lib/` first — reuse, don't duplicate.

## Roles (Clerk)

| Role | Key | Access |
|------|-----|--------|
| Super Admin | `org:super_admin` | Everything |
| Event Coordinator | `org:event_coordinator` | Events, Program, Registration, Comms, Certs |
| Ops | `org:ops` | Travel, Accommodation, Transport only |
| Read-only | `org:read_only` | All visible, all write actions disabled |

Check permissions with `has()` from `@clerk/nextjs`. Hide UI elements the role cannot access. Disable (don't hide) write buttons for Read-only.

## Notification Service Pattern

All notifications go through `lib/notifications/`. Never call Resend or Evolution API directly from a page or API route.

```
lib/notifications/
├── send.ts          # Unified send(channel, template, recipient, variables)
├── email.ts         # Resend adapter
├── whatsapp.ts      # Evolution API adapter (swap to WABA later)
└── templates/       # Template registry mapping template IDs to channels
```

This abstraction exists so WhatsApp provider can be swapped without touching any module code.

## Cascade System (Inngest)

When travel/accommodation/session data changes, emit an Inngest event. Never manually trigger downstream updates.

```
conference/travel.updated    -> flag accommodation + recalculate transport + notify delegate
conference/session.updated   -> notify affected faculty with revised responsibilities
conference/registration.created -> send confirmation + assign QR
```

Event definitions live in `lib/cascade/events.ts`. Handler functions in `lib/cascade/handlers/`.

## Testing

**Full governance rules: `docs/TEST_GOVERNANCE.md`**

### Anti-Cheating Rule (MANDATORY)
The agent that wrote the code MUST NOT be the authority on expected test outcomes.
- Derive test expectations from SPECS, SCHEMAS, and DOMAIN RULES — never from reading implementation code.
- Use property-based testing (fast-check) for boundary conditions instead of hand-picked examples.
- Run `npm run test:mutate` (Stryker) to validate test quality — mutation score < 50% = tests are theater.
- Everything under `qa/generated/` is NON-AUTHORITATIVE. It is not a quality gate.

### Test Layers
1. **Vitest unit** — business logic, Zod validation, RBAC, cascade. Agent may write. (`npm run test:run`)
2. **fast-check property** — random edge case discovery. Agent scaffolds, properties from specs. (`npm run test:property`)
3. **Stryker mutation** — "who tests the tests?" Nightly gate. (`npm run test:mutate`)
4. **Playwright private** — human-authored acceptance tests, hidden from agent. Agent only sees pass/fail.
5. **Visual + a11y** — screenshot baselines + axe-core WCAG checks. (`npm run test:a11y`)

### TDD Cycle
Use the TDD skill (/tdd) for all business logic:
1. RED — one failing test for the next behavior
2. GREEN — minimal code to pass only that test
3. REFACTOR — clean up, then repeat

Priority test targets: cascade logic, RBAC checks, conflict detection, idempotency, Zod validations.

Do NOT write bulk tests after implementation. Do NOT write tests that check internal implementation details.

## Commit Discipline

One logical change per commit. Write a descriptive commit message.
After any feature implementation, run `/simplify` before committing.
Run `/diff` to review all changes before committing.

## When Compacting

Preserve: list of all modified files, current module being built, test status, any open decisions or blockers.

## Red Flags Table (for travel/accommodation/transport)

Three states: `unreviewed` (red), `reviewed` (yellow), `resolved` (cleared).
Flag records store: `flag_type`, `flag_detail`, `flag_status`, `flag_created_at`, `reviewed_by`, `resolved_by`.
