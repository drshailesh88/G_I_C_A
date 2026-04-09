# communications — Spec 010

STATUS: BLOCKED
TESTED: 0/18
PASS: 0
FAIL: 0
BLOCKED: 18
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Automation Triggers
- [ ] **Create trigger** — createTrigger with valid input; verify row returned with isEnabled=true `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Update trigger** — updateTrigger changing channel; verify updated row returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **List triggers for event** — create 3 triggers; listTriggersForEvent; verify all 3 returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **List triggers filter by type** — filter by triggerEventType; verify only matching triggers returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **List triggers filter by channel** — filter by channel='email'; verify only email triggers returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **List triggers filter by enabled** — disable one, filter isEnabled=true; verify disabled excluded `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Get active triggers joins template** — create trigger+template; getActiveTriggersForEventType; verify template data joined `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Active triggers validate template scope** — trigger with global template; verify global templates accepted `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Delete trigger event-scoped** — create for event A, delete with event B; verify not deleted `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Delete trigger succeeds** — delete with correct eventId; verify row removed `[CONFIRMED]` BLOCKED:needs-db

### Server Actions & Auth
- [ ] **Zod validates retry input** — call retryNotification with invalid data; verify Zod error `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Zod validates resend input** — call manualResend with invalid data; verify Zod error `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Read-only can list failed** — authenticate as read-only role; call getFailedNotifications; verify success `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Write required for retry** — authenticate as read-only; call retryNotification; verify rejected `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Write required for resend** — authenticate as read-only; call manualResend; verify rejected `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Path revalidated after retry** — successful retry; verify revalidatePath called `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Path revalidated after resend** — successful resend; verify revalidatePath called `[CONFIRMED]` BLOCKED:needs-db
- [ ] **getNotificationDetail auth check** — call without auth; verify rejected `[CONFIRMED]` BLOCKED:needs-db
