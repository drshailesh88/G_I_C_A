# communications — Spec 002

STATUS: PASSING
TESTED: 16/16
PASS: 16
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Resend & Retry
#### Resend Flow
- [x] **Resend creates new log** — call resendNotification; verify a new notification log row created (different ID from original) `[CONFIRMED]`
- [x] **Resend fresh idempotency key** — verify new key starts with 'resend:' and includes timestamp `[CONFIRMED]`
- [x] **Resend links to original** — verify new log row has resendOfId pointing to original notification ID `[CONFIRMED]`
- [x] **Resend marks isResend=true** — verify new log has isResend=true `[CONFIRMED]`
- [x] **Resend original not found throws** — call resendNotification with invalid logId; verify error thrown with 'not found' message `[CONFIRMED]`

#### Retry Flow
- [x] **Retry succeeds on failed status** — create log with status='failed', retry it; verify new send attempt made `[CONFIRMED]`
- [x] **Retry rejects non-failed status** — create log with status='sent', attempt retry; verify error thrown with 'expected "failed"' `[CONFIRMED]`
- [x] **Concurrent retry blocked** — simulate two concurrent retry calls; verify second one throws 'already in progress' `[CONFIRMED]`
- [x] **markAsRetrying CAS lock** — call markAsRetrying; verify status atomically changes to 'retrying' only if currently 'failed' `[CONFIRMED]`
- [x] **Retry uses stored content** — retry a failed notification; verify rendered body from original log is reused, not re-rendered `[CONFIRMED]`
- [x] **Retry idempotency key** — verify retry key starts with 'retry:' and includes timestamp `[CONFIRMED]`

#### Resend/Retry Circuit Breaker
- [x] **Resend checks circuit** — open circuit, attempt resend; verify CIRCUIT_OPEN failure recorded `[CONFIRMED]`
- [x] **Retry checks circuit** — open circuit, attempt retry; verify CIRCUIT_OPEN failure recorded `[CONFIRMED]`

### Dependency Injection
- [x] **All deps injectable** — create sendNotification with custom deps; verify custom providers called instead of defaults `[CONFIRMED]`
- [x] **Default deps use real providers** — verify defaultDeps has resendEmailProvider, evolutionWhatsAppProvider, redisIdempotencyService `[CONFIRMED]`
- [x] **Null circuit breaker skips checks** — send with circuitBreaker=null; verify no circuit breaker errors `[CONFIRMED]`
