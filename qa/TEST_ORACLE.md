# Test Oracle

> The source of truth for what the app is SUPPOSED to do.
> The current implementation is NOT the oracle.
> Created: 2026-04-13

---

## Oracle Hierarchy (in priority order)

1. **Explicit PM decisions** — anything the user/PM has explicitly stated
2. **AGENTS.md rules** — the "Never Do" and "Always Do" lists
3. **research-hub/DESIGN_DECISIONS.md** — locked UX and tech decisions
4. **research-hub/PROJECT_HANDOFF.md** — wireframes, navigation graph, screen inventory
5. **research-hub/BACKEND_ARCHITECTURE_MAP.md** — module-library map, infrastructure rules
6. **research-hub/DEFERRED_TICKETS.md** — items that need design before building
7. **Frozen QA packets** — once a spec is frozen, it becomes part of the oracle
8. **Runtime discovery** — what the app actually does (evidence only, not correctness)
9. **Implementation code** — what exists (discovery only, NEVER treated as correct)

---

## Product Rules (Derived from Oracle Sources)

### Data Isolation
- Every database query MUST filter by `eventId`
- Cross-event data leakage is a critical bug
- Event switching must not expose other events' data

### Input Validation
- Every API route validates with Zod BEFORE processing
- Invalid input returns 400 with structured validation errors
- No raw user input reaches the database unvalidated

### Audit Trail
- Every mutation to travel/accommodation/transport writes audit log
- Audit captures: who, what, when, before-state, after-state
- Audit records are immutable (append-only)

### Notifications
- All notifications go through `lib/notifications/send.ts`
- Redis idempotency key checked before every send
- Key format: `notification:{userId}:{eventId}:{type}:{triggerId}`
- Duplicate sends must not dispatch a second notification; exact API response behavior is module-specific unless specified by PM

### Phone Numbers
- Normalized to E.164 on input using `libphonenumber-js`
- Indian phone numbers must normalize to valid E.164; default-region behavior requires explicit spec/PM confirmation
- Invalid phone numbers are rejected at input

### Timestamps
- Stored in UTC in database
- Displayed in IST (Asia/Kolkata) in UI
- Conversions use `date-fns-tz`

### File Uploads
- Max 20MB per file
- Oversized uploads rejected with clear error message
- Files stored in Cloudflare R2 with event-scoped prefixes

### Roles (Clerk)
| Role | Key | Can Access | Cannot Access |
|------|-----|-----------|---------------|
| Super Admin | `org:super_admin` | Everything | — |
| Event Coordinator | `org:event_coordinator` | Events, Program, Registration, Comms, Certs | Travel, Accommodation, Transport |
| Ops | `org:ops` | Travel, Accommodation, Transport only | Events CRUD, Program, Registration, Comms, Certs (note: whether Ops sees the dashboard shell event-context selector is a PM decision to verify, distinct from Events CRUD access) |
| Read-only | `org:read_only` | All visible | All write actions (disabled, not hidden) |

### Cascade System
| Trigger Event | Downstream Effects |
|--------------|-------------------|
| `conference/travel.updated` | Flag accommodation + recalculate transport + notify delegate |
| `conference/session.updated` | Notify affected faculty with revised responsibilities |
| `conference/registration.created` | Send confirmation + assign QR |

### Red Flags
- Three states: `unreviewed` (red) -> `reviewed` (yellow) -> `resolved` (cleared)
- Flag records store: flag_type, flag_detail, flag_status, flag_created_at, reviewed_by, resolved_by
- "Mark as Reviewed" transitions red -> yellow
- "Mark as Resolved" clears the flag

### Navigation Structure
- Bottom tabs: HOME, EVENTS, PEOPLE, PROGRAM, MORE
- M21 Event Workspace is the HUB for all event-specific features
- M08 More Menu provides access to logistics, certificates, QR, reports, branding, settings
- Public flows (no auth): Event Landing -> Registration -> Success; Faculty Invite -> Confirm

---

## Oracle File Locations

Future oracle data files (Phase 0B+):

```
qa/oracle/
  product-rules.json       # Machine-readable invariants
  module-map.json          # Module -> routes -> features
  role-matrix.json         # Role -> module -> permissions
  event-isolation-rules.json
  mutation-audit-rules.json
  notification-rules.json
  navigation-graph.json
  public-user-journeys.json
```

---

## How To Use The Oracle

### When Writing Specs
1. Look up the feature in PROJECT_HANDOFF.md (wireframe + navigation)
2. Check DESIGN_DECISIONS.md for locked UX behavior
3. Check BACKEND_ARCHITECTURE_MAP.md for expected backend behavior
4. Apply invariants from AGENTS.md
5. Write spec checkpoints based on these sources

### When Implementation Disagrees With Oracle
- The implementation is WRONG, not the oracle
- File it as a bug / FAIL
- Do NOT update the oracle to match broken implementation
- Exception: if the oracle itself is wrong, file SPEC-BUG with PM approval

### When Oracle Is Silent
- If no oracle source covers a behavior, mark it `NEEDS_HUMAN_DECISION`
- Do NOT invent requirements from implementation code
- Do NOT assume "whatever the code does is correct"
