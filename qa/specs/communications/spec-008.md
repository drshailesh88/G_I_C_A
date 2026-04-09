# communications — Spec 008

STATUS: PENDING
TESTED: 0/22
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Webhook Ingestion
- [ ] **Resend webhook ingested** — call ingestEmailStatus with valid Resend payload; verify delivery event inserted `[CONFIRMED]`
- [ ] **Evolution webhook ingested** — call ingestWhatsAppStatus with valid payload; verify delivery event inserted `[CONFIRMED]`
- [ ] **Channel mismatch rejected** — send email webhook for WhatsApp log; verify no status update `[CONFIRMED]`
- [ ] **Delivery event always inserted** — even when status CAS rejects; verify delivery_events row created `[CONFIRMED]`
- [ ] **DB-level CAS rejects regression** — log at 'delivered', webhook with 'sent'; verify status NOT downgraded `[CONFIRMED]`
- [ ] **Failed status overrides any** — log at 'delivered', webhook with 'failed'; verify status updated to 'failed' `[CONFIRMED]`
- [ ] **Processing failure pushes to DLQ** — simulate DB error; verify pushToDlq called with payload `[CONFIRMED]`

### Webhook Authentication
- [ ] **Valid Resend signature accepted** — correct HMAC signature; verify returns true `[CONFIRMED]`
- [ ] **Invalid Resend signature rejected** — wrong signature; verify returns false `[CONFIRMED]`
- [ ] **Missing Svix headers rejected** — null svixId/svixTimestamp; verify returns false `[CONFIRMED]`
- [ ] **Missing RESEND_WEBHOOK_SECRET rejected** — no env var; verify returns false `[CONFIRMED]`
- [ ] **Multi-signature support** — svixSignature with multiple v1, entries; verify valid one accepted `[CONFIRMED]`
- [ ] **Valid Evolution token accepted** — correct Bearer token; verify returns true `[CONFIRMED]`
- [ ] **Invalid Evolution token rejected** — wrong token; verify returns false `[CONFIRMED]`
- [ ] **Missing Evolution secret rejected** — no env var; verify returns false `[CONFIRMED]`
- [ ] **Timing-safe comparison** — verify timingSafeEqual used (not ===) `[CONFIRMED]`

### Dead Letter Queue
- [ ] **Push to DLQ succeeds** — pushToDlq with entry; verify Redis LPUSH called `[CONFIRMED]`
- [ ] **DLQ TTL set to 7 days** — verify EXPIRE called with 604800 `[CONFIRMED]`
- [ ] **Pop from DLQ returns entries** — push 3 entries, pop 3; verify all 3 returned oldest-first `[CONFIRMED]`
- [ ] **Pop from empty DLQ returns empty** — pop from empty; verify returns [] `[CONFIRMED]`
- [ ] **DLQ size returns count** — push 5, getDlqSize; verify returns 5 `[CONFIRMED]`
- [ ] **Redis down on push returns false** — null Redis client; verify returns false and logs error `[CONFIRMED]`
