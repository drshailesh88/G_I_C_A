# GEM India — Conference Management Platform

Next.js 16 + Clerk + Drizzle ORM + Neon (Postgres) + shadcn/ui + Tailwind CSS.
Monorepo. App Router. TypeScript strict mode.

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
│   │   ├── events/         # Event CRUD + workspace
│   │   ├── people/         # People list + import + merge
│   │   ├── program/        # Sessions + schedule grid
│   │   ├── registration/   # Admin registration list
│   │   ├── travel/         # Travel records
│   │   ├── accommodation/  # Accommodation + red flags
│   │   ├── transport/      # Arrival planning + vehicle kanban
│   │   ├── communications/ # Templates + automation triggers
│   │   ├── certificates/   # Certificate generation + editor
│   │   ├── qr/             # QR scanner + attendance
│   │   ├── reports/        # Exports
│   │   ├── branding/       # Letterheads
│   │   └── settings/       # Team + roles
│   └── (public)/           # Landing page, registration form, faculty confirm
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

Use TDD for all business logic. The cycle is:
1. RED — one failing test for the next behavior
2. GREEN — minimal code to pass only that test
3. REFACTOR — clean up, then repeat

Priority test targets: cascade logic, RBAC checks, conflict detection, idempotency, Zod validations.

Do NOT write bulk tests after implementation. Do NOT write tests that check internal implementation details.

## Commit Discipline

One logical change per commit. Write a descriptive commit message.
Review all changes with `git diff` before committing.

## Review Role

When used as a reviewer against Claude Code's output:
- Check that no files outside the target module were modified.
- Check that every database query includes `eventId` filtering.
- Check that no secrets are hardcoded.
- Check that notification sends go through `lib/notifications/`, not direct provider calls.
- Check that Zod validation exists on every API route.
- Flag any duplicated logic that should reuse an existing function in `lib/`.

## Red Flags Table (for travel/accommodation/transport)

Three states: `unreviewed` (red), `reviewed` (yellow), `resolved` (cleared).
Flag records store: `flag_type`, `flag_detail`, `flag_status`, `flag_created_at`, `reviewed_by`, `resolved_by`.
