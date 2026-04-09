# communications — Spec 009

STATUS: PENDING
TESTED: 0/17
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Notification Log Queries
- [ ] **Create log entry returns full row** — insert log; verify returned row has id, eventId, status='queued' `[CONFIRMED]`
- [ ] **Create log with all fields** — insert with all optional fields; verify all persisted correctly `[CONFIRMED]`
- [ ] **Update log status** — update to 'sent' with providerMessageId; verify row updated with sentAt `[CONFIRMED]`
- [ ] **Update sets lastAttemptAt** — any updateLogStatus call; verify lastAttemptAt set to now `[CONFIRMED]`
- [ ] **markAsRetrying only on failed** — log with status='failed'; verify markAsRetrying returns updated row `[CONFIRMED]`
- [ ] **markAsRetrying rejects non-failed** — log with status='sent'; verify markAsRetrying returns null `[CONFIRMED]`
- [ ] **getLogById scoped by eventId** — create log for event A, query with event B; verify null returned `[CONFIRMED]`
- [ ] **getLogById returns correct log** — create log, query by id+eventId; verify correct row returned `[CONFIRMED]`
- [ ] **listFailedLogs returns only failed** — create sent + failed logs; verify only failed returned `[CONFIRMED]`
- [ ] **listFailedLogs ordered by failedAt DESC** — create 3 failed at different times; verify newest first `[CONFIRMED]`
- [ ] **listFailedLogs channel filter** — create email + whatsapp failures; filter by email; verify only email returned `[CONFIRMED]`
- [ ] **listFailedLogs templateKey filter** — create failures with different keys; filter; verify correct subset `[CONFIRMED]`
- [ ] **listFailedLogs pagination** — create 10 failures, request limit=5 offset=3; verify 5 rows starting from 4th `[CONFIRMED]`
- [ ] **listFailedLogs default limit 50** — no limit specified; verify default limit applied `[CONFIRMED]`

### Delivery Event Queries
- [ ] **Insert delivery event** — insertDeliveryEvent; verify row created with notificationLogId `[CONFIRMED]`
- [ ] **List delivery events event-scoped** — log for event A; list with event B; verify empty array `[CONFIRMED]`
- [ ] **Find log by provider message ID** — create log, find by providerMessageId; verify correct row `[CONFIRMED]`
