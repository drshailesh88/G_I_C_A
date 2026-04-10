# Spec 07: Auth, Access Control & Database

Module: accommodation
Source: feature-census/accommodation/CENSUS.md
Coverage: vitest (unit/integration) — all checkpoints passing
Playwright: BLOCKED — dev server unresponsive, no Clerk auth infra

STATUS: COMPLETE (vitest)
TESTED: 9/9
PASS: 9
FAIL: 0
BLOCKED: 0
E2E: BLOCKED (no Clerk auth infra, dev server unresponsive)

## Checkpoints

### CP-67: List page requires event access
- **Action:** Visit /events/:eventId/accommodation without auth
- **Pass:** Redirects to /login
- **Fail:** Page renders without auth

### CP-68: New page requires write access
- **Action:** Visit /events/:eventId/accommodation/new with read-only role
- **Pass:** Redirects to /login (assertEventAccess with requireWrite)
- **Fail:** Form renders for read-only user

### CP-69: Create action requires write access
- **Action:** Call createAccommodationRecord without write permission
- **Pass:** Throws auth error
- **Fail:** Record created without permission

### CP-70: Update action requires write access
- **Action:** Call updateAccommodationRecord without write permission
- **Pass:** Throws auth error
- **Fail:** Record updated without permission

### CP-71: Cancel action requires write access
- **Action:** Call cancelAccommodationRecord without write permission
- **Pass:** Throws auth error
- **Fail:** Record cancelled without permission

### CP-72: All queries scope by eventId
- **Action:** List/get records with mismatched eventId
- **Pass:** No cross-event data leakage
- **Fail:** Returns records from other events

### CP-73: Revalidation on create
- **Action:** Create a record
- **Pass:** revalidatePath called for /events/:eventId/accommodation
- **Fail:** List not refreshed

### CP-74: Revalidation on update
- **Action:** Update a record
- **Pass:** revalidatePath called
- **Fail:** List shows stale data

### CP-75: Revalidation on cancel
- **Action:** Cancel a record
- **Pass:** revalidatePath called
- **Fail:** List shows stale data
