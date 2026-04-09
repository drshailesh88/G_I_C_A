# communications — Spec 002

STATUS: PENDING
TESTED: 0/16
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Resend & Retry
#### Resend Flow
- [ ] **Resend creates new log** — call resendNotification; verify a new notification log row created (different ID from original) `[CONFIRMED]`
- [ ] **Resend fresh idempotency key** — verify new key starts with 'resend:' and includes timestamp `[CONFIRMED]`
- [ ] **Resend links to original** — verify new log row has resendOfId pointing to original notification ID `[CONFIRMED]`
- [ ] **Resend marks isResend=true** — verify new log has isResend=true `[CONFIRMED]`
- [ ] **Resend original not found throws** — call resendNotification with invalid logId; verify error thrown with 'not found' message `[CONFIRMED]`

#### Retry Flow
- [ ] **Retry succeeds on failed status** — create log with status='failed', retry it; verify new send attempt made `[CONFIRMED]`
- [ ] **Retry rejects non-failed status** — create log with status='sent', attempt retry; verify error thrown with 'expected "failed"' `[CONFIRMED]`
- [ ] **Concurrent retry blocked** — simulate two concurrent retry calls; verify second one throws 'already in progress' `[CONFIRMED]`
- [ ] **markAsRetrying CAS lock** — call markAsRetrying; verify status atomically changes to 'retrying' only if currently 'failed' `[CONFIRMED]`
- [ ] **Retry uses stored content** — retry a failed notification; verify rendered body from original log is reused, not re-rendered `[CONFIRMED]`
- [ ] **Retry idempotency key** — verify retry key starts with 'retry:' and includes timestamp `[CONFIRMED]`

#### Resend/Retry Circuit Breaker
- [ ] **Resend checks circuit** — open circuit, attempt resend; verify CIRCUIT_OPEN failure recorded `[CONFIRMED]`
- [ ] **Retry checks circuit** — open circuit, attempt retry; verify CIRCUIT_OPEN failure recorded `[CONFIRMED]`

### Dependency Injection
- [ ] **All deps injectable** — create sendNotification with custom deps; verify custom providers called instead of defaults `[CONFIRMED]`
- [ ] **Default deps use real providers** — verify defaultDeps has resendEmailProvider, evolutionWhatsAppProvider, redisIdempotencyService `[CONFIRMED]`
- [ ] **Null circuit breaker skips checks** — send with circuitBreaker=null; verify no circuit breaker errors `[CONFIRMED]`
