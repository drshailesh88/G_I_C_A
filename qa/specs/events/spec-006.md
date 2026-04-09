# events — Spec 006: Role Definitions & Tab Access

STATUS: PENDING
TESTED: 0/10
PASS: 0
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/auth/roles.test.ts

---

### ROLES Constants
- [ ] **SUPER_ADMIN is "org:super_admin"** — ROLES.SUPER_ADMIN === "org:super_admin" `[CONFIRMED]`
- [ ] **EVENT_COORDINATOR is "org:event_coordinator"** — ROLES.EVENT_COORDINATOR === "org:event_coordinator" `[CONFIRMED]`
- [ ] **OPS is "org:ops"** — ROLES.OPS === "org:ops" `[CONFIRMED]`
- [ ] **READ_ONLY is "org:read_only"** — ROLES.READ_ONLY === "org:read_only" `[CONFIRMED]`
- [ ] **exactly 4 roles defined** — Object.keys(ROLES).length === 4 `[CONFIRMED]`

### TAB_ACCESS
- [ ] **EVENTS tab accessible to super_admin** — TAB_ACCESS.EVENTS includes ROLES.SUPER_ADMIN `[CONFIRMED]`
- [ ] **EVENTS tab accessible to event_coordinator** — TAB_ACCESS.EVENTS includes ROLES.EVENT_COORDINATOR `[CONFIRMED]`
- [ ] **EVENTS tab accessible to read_only** — TAB_ACCESS.EVENTS includes ROLES.READ_ONLY `[CONFIRMED]`
- [ ] **EVENTS tab NOT accessible to ops** — TAB_ACCESS.EVENTS does NOT include ROLES.OPS `[CONFIRMED]`
- [ ] **HOME tab accessible to all 4 roles** — TAB_ACCESS.HOME.length === 4 `[CONFIRMED]`
