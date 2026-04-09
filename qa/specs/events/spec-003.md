# events — Spec 003: Access Control (event-access.ts)

STATUS: PENDING
TESTED: 0/18
PASS: 0
FAIL: 0
BLOCKED: 0
MODULE: events
TEST_TYPE: unit (vitest)
FILE: src/lib/auth/event-access.test.ts

---

### checkEventAccess — Authentication
- [ ] **unauthenticated returns unauthorized** — mockAuth returns null userId, expect authorized: false `[CONFIRMED]`
- [ ] **no recognized Clerk role denied even with assignment** — has() returns false for all roles, expect authorized: false `[CONFIRMED]`

### checkEventAccess — Super Admin
- [ ] **super admin bypasses event assignment** — super admin role, expect authorized: true without DB query `[CONFIRMED]`
- [ ] **super admin does not query event_user_assignments** — verify db.select not called `[CONFIRMED]`

### checkEventAccess — Assignment-based Access
- [ ] **coordinator with assignment authorized** — coordinator role + active assignment row, expect authorized: true `[CONFIRMED]`
- [ ] **coordinator without assignment denied** — coordinator role + no assignment, expect authorized: false `[CONFIRMED]`
- [ ] **ops with assignment authorized** — ops role + active assignment, expect authorized: true `[CONFIRMED]`
- [ ] **ops without assignment denied** — ops role + no assignment, expect authorized: false `[CONFIRMED]`
- [ ] **read-only with assignment authorized (read)** — read-only + active assignment, expect authorized: true `[CONFIRMED]`
- [ ] **read-only without assignment denied** — read-only + no assignment, expect authorized: false `[CONFIRMED]`

### assertEventAccess
- [ ] **throws when access denied** — unauthorized user, expect throw /forbidden/i `[CONFIRMED]`
- [ ] **returns userId and role when granted** — super admin, expect { userId, role } `[CONFIRMED]`
- [ ] **read-only blocked from write (requireWrite: true)** — read-only + assignment + requireWrite, expect throw `[CONFIRMED]`
- [ ] **coordinator allowed for write** — coordinator + assignment + requireWrite, expect success `[CONFIRMED]`
- [ ] **ops allowed for write** — ops + assignment + requireWrite, expect success `[CONFIRMED]`
- [ ] **super admin allowed for write** — super admin + requireWrite, expect success `[CONFIRMED]`

### getEventListContext
- [ ] **super admin returns isSuperAdmin true** — super admin role, expect isSuperAdmin: true `[CONFIRMED]`
- [ ] **coordinator returns isSuperAdmin false** — coordinator role, expect isSuperAdmin: false `[CONFIRMED]`
