# Module Priorities

> Testing order based on risk, complexity, and dependency chain.
> Created: 2026-04-13

---

## Priority Order

| Priority | Module | Route Pattern | Risk Level | Rationale |
|----------|--------|--------------|------------|-----------|
| 1 | Auth + Dashboard Shell | `(auth)/*`, `(dashboard)/` | HIGH | Gate to everything; role enforcement starts here |
| 2 | Events / Workspace | `(dashboard)/events/*` | HIGH | Hub for all event features; eventId scoping starts here |
| 3 | Registration | `(dashboard)/registration/*`, `(public)/*` | HIGH | Public-facing; data integrity; cascade trigger |
| 4 | People / Import / Merge | `(dashboard)/people/*` | HIGH | CSV import; duplicate detection; data quality |
| 5 | Travel | `(dashboard)/travel/*` | HIGH | Cascade trigger; audit log; red flags |
| 6 | Accommodation | `(dashboard)/accommodation/*` | HIGH | Red flags; cascade consumer; audit log |
| 7 | Transport | `(dashboard)/transport/*` | MEDIUM | Kanban; batch logic; cascade consumer |
| 8 | Communications | `(dashboard)/communications/*` | MEDIUM | Templates; triggers; notification service |
| 9 | Certificates | `(dashboard)/certificates/*` | MEDIUM | PDF generation; bulk ops; delivery |
| 10 | QR & Attendance | `(dashboard)/qr/*` | MEDIUM | Scanner; offline; real-time |
| 11 | Reports | `(dashboard)/reports/*` | LOW | Read-only exports |
| 12 | Branding | `(dashboard)/branding/*` | LOW | Asset management |
| 13 | Settings | `(dashboard)/settings/*` | LOW | Team/role management |

---

## Pilot Module: Events/Workspace

**Recommended pilot: Events/Workspace (Priority 2)**

Rationale:
- It is the HUB screen (M21) that connects to most other modules
- Tests eventId scoping at the source (event creation/selection)
- Tests role-based access (all roles interact with events differently)
- Tests CRUD operations with Zod validation
- Tests navigation graph accuracy (workspace links to sessions, schedule, registrations, etc.)
- Does NOT require complex external service mocking (no WhatsApp, no certificates)
- Simpler than registration (no public form, no cascade)

If Events/Workspace pilot reveals the loop is too complex, fall back to a simpler smoke test first (auth flow only).

---

## Module Dependency Chain

```
Auth (login, roles)
  -> Dashboard Shell (navigation, event selector)
    -> Events/Workspace (event CRUD, workspace hub)
      -> Registration (public form, admin list, cascade trigger)
      -> People (import, merge, master DB)
      -> Program (sessions, schedule grid, faculty)
      -> Travel (CRUD, cascade source)
        -> Accommodation (red flags, cascade consumer)
        -> Transport (batches, kanban, cascade consumer)
      -> Communications (templates, triggers, notification service)
      -> Certificates (template editor, generation, delivery)
      -> QR (scanner, attendance, offline)
      -> Reports (read-only, exports)
      -> Branding (assets, letterheads)
      -> Settings (team, roles)
```

---

## Risk Categories Per Module

### Critical (test first, test deeply)
- Cross-event data leakage
- Role enforcement failures
- Audit log gaps
- Notification idempotency failures
- Cascade chain breaks

### High (test thoroughly)
- Zod validation bypasses
- File upload boundary violations
- Phone number normalization failures
- Timezone display errors
- Public form security

### Medium (test happy + key edges)
- UI state management
- Empty states
- Loading states
- Mobile responsive behavior
- Error messages

### Low (smoke test)
- Static pages
- Report exports
- Branding assets
