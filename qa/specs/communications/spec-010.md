# communications — Spec 010

STATUS: PENDING
TESTED: 0/18
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Automation Triggers
- [ ] **Create trigger** — createTrigger with valid input; verify row returned with isEnabled=true `[CONFIRMED]`
- [ ] **Update trigger** — updateTrigger changing channel; verify updated row returned `[CONFIRMED]`
- [ ] **List triggers for event** — create 3 triggers; listTriggersForEvent; verify all 3 returned `[CONFIRMED]`
- [ ] **List triggers filter by type** — filter by triggerEventType; verify only matching triggers returned `[CONFIRMED]`
- [ ] **List triggers filter by channel** — filter by channel='email'; verify only email triggers returned `[CONFIRMED]`
- [ ] **List triggers filter by enabled** — disable one, filter isEnabled=true; verify disabled excluded `[CONFIRMED]`
- [ ] **Get active triggers joins template** — create trigger+template; getActiveTriggersForEventType; verify template data joined `[CONFIRMED]`
- [ ] **Active triggers validate template scope** — trigger with global template; verify global templates accepted `[CONFIRMED]`
- [ ] **Delete trigger event-scoped** — create for event A, delete with event B; verify not deleted `[CONFIRMED]`
- [ ] **Delete trigger succeeds** — delete with correct eventId; verify row removed `[CONFIRMED]`

### Server Actions & Auth
- [ ] **Zod validates retry input** — call retryNotification with invalid data; verify Zod error `[CONFIRMED]`
- [ ] **Zod validates resend input** — call manualResend with invalid data; verify Zod error `[CONFIRMED]`
- [ ] **Read-only can list failed** — authenticate as read-only role; call getFailedNotifications; verify success `[CONFIRMED]`
- [ ] **Write required for retry** — authenticate as read-only; call retryNotification; verify rejected `[CONFIRMED]`
- [ ] **Write required for resend** — authenticate as read-only; call manualResend; verify rejected `[CONFIRMED]`
- [ ] **Path revalidated after retry** — successful retry; verify revalidatePath called `[CONFIRMED]`
- [ ] **Path revalidated after resend** — successful resend; verify revalidatePath called `[CONFIRMED]`
- [ ] **getNotificationDetail auth check** — call without auth; verify rejected `[CONFIRMED]`
