# communications — Spec 008

STATUS: PARTIAL
TESTED: 17/22
PASS: 17
FAIL: 0
BLOCKED: 5
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Webhook Ingestion
- [x] **Resend webhook ingested** — call ingestEmailStatus with valid Resend payload; verify delivery event inserted `[CONFIRMED]`
- [x] **Evolution webhook ingested** — call ingestWhatsAppStatus with valid payload; verify delivery event inserted `[CONFIRMED]`
- [x] **Channel mismatch rejected** — send email webhook for WhatsApp log; verify no status update `[CONFIRMED]`
- [ ] **Delivery event always inserted** — even when status CAS rejects; verify delivery_events row created `[CONFIRMED]` BLOCKED:needs-db
- [ ] **DB-level CAS rejects regression** — log at 'delivered', webhook with 'sent'; verify status NOT downgraded `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Failed status overrides any** — log at 'delivered', webhook with 'failed'; verify status updated to 'failed' `[CONFIRMED]` BLOCKED:needs-db
- [x] **Processing failure pushes to DLQ** — simulate DB error; verify pushToDlq called with payload `[CONFIRMED]`

### Webhook Authentication
- [x] **Valid Resend signature accepted** — correct HMAC signature; verify returns true `[CONFIRMED]`
- [x] **Invalid Resend signature rejected** — wrong signature; verify returns false `[CONFIRMED]`
- [x] **Missing Svix headers rejected** — null svixId/svixTimestamp; verify returns false `[CONFIRMED]`
- [x] **Missing RESEND_WEBHOOK_SECRET rejected** — no env var; verify returns false `[CONFIRMED]`
- [x] **Multi-signature support** — svixSignature with multiple v1, entries; verify valid one accepted `[CONFIRMED]`
- [x] **Valid Evolution token accepted** — correct Bearer token; verify returns true `[CONFIRMED]`
- [x] **Invalid Evolution token rejected** — wrong token; verify returns false `[CONFIRMED]`
- [x] **Missing Evolution secret rejected** — no env var; verify returns false `[CONFIRMED]`
- [x] **Timing-safe comparison** — verify timingSafeEqual used (not ===) `[CONFIRMED]`

### Dead Letter Queue
- [x] **Push to DLQ succeeds** — pushToDlq with entry; verify Redis LPUSH called `[CONFIRMED]`
- [x] **DLQ TTL set to 7 days** — verify EXPIRE called with 604800 `[CONFIRMED]`
- [ ] **Pop from DLQ returns entries** — push 3 entries, pop 3; verify all 3 returned oldest-first `[CONFIRMED]` BLOCKED:needs-db
- [x] **Pop from empty DLQ returns empty** — pop from empty; verify returns [] `[CONFIRMED]`
- [ ] **DLQ size returns count** — push 5, getDlqSize; verify returns 5 `[CONFIRMED]` BLOCKED:needs-db
- [x] **Redis down on push returns false** — null Redis client; verify returns false and logs error `[CONFIRMED]`
