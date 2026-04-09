# communications — Spec 009

STATUS: BLOCKED
TESTED: 0/17
PASS: 0
FAIL: 0
BLOCKED: 17
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Notification Log Queries
- [ ] **Create log entry returns full row** — insert log; verify returned row has id, eventId, status='queued' `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Create log with all fields** — insert with all optional fields; verify all persisted correctly `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Update log status** — update to 'sent' with providerMessageId; verify row updated with sentAt `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Update sets lastAttemptAt** — any updateLogStatus call; verify lastAttemptAt set to now `[CONFIRMED]` BLOCKED:needs-db
- [ ] **markAsRetrying only on failed** — log with status='failed'; verify markAsRetrying returns updated row `[CONFIRMED]` BLOCKED:needs-db
- [ ] **markAsRetrying rejects non-failed** — log with status='sent'; verify markAsRetrying returns null `[CONFIRMED]` BLOCKED:needs-db
- [ ] **getLogById scoped by eventId** — create log for event A, query with event B; verify null returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **getLogById returns correct log** — create log, query by id+eventId; verify correct row returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **listFailedLogs returns only failed** — create sent + failed logs; verify only failed returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **listFailedLogs ordered by failedAt DESC** — create 3 failed at different times; verify newest first `[CONFIRMED]` BLOCKED:needs-db
- [ ] **listFailedLogs channel filter** — create email + whatsapp failures; filter by email; verify only email returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **listFailedLogs templateKey filter** — create failures with different keys; filter; verify correct subset `[CONFIRMED]` BLOCKED:needs-db
- [ ] **listFailedLogs pagination** — create 10 failures, request limit=5 offset=3; verify 5 rows starting from 4th `[CONFIRMED]` BLOCKED:needs-db
- [ ] **listFailedLogs default limit 50** — no limit specified; verify default limit applied `[CONFIRMED]` BLOCKED:needs-db

### Delivery Event Queries
- [ ] **Insert delivery event** — insertDeliveryEvent; verify row created with notificationLogId `[CONFIRMED]` BLOCKED:needs-db
- [ ] **List delivery events event-scoped** — log for event A; list with event B; verify empty array `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Find log by provider message ID** — create log, find by providerMessageId; verify correct row `[CONFIRMED]` BLOCKED:needs-db
