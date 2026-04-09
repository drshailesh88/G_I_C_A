# communications — Spec 011

STATUS: PENDING
TESTED: 0/15
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Webhook API Routes
- [ ] **Email webhook verifies Svix signature** — POST /api/webhooks/email with valid signature; verify 200 returned `[CONFIRMED]`
- [ ] **Email webhook rejects invalid signature** — POST with wrong signature; verify 401 returned `[CONFIRMED]`
- [ ] **Email webhook returns 200 on processing error** — valid signature but ingest throws; verify 200 still returned `[CONFIRMED]`
- [ ] **Email webhook captures Sentry on error** — processing error; verify captureNotificationError called `[CONFIRMED]`
- [ ] **WhatsApp webhook verifies Bearer token** — POST /api/webhooks/whatsapp with valid token; verify 200 returned `[CONFIRMED]`
- [ ] **WhatsApp webhook rejects invalid token** — POST with wrong token; verify 401 returned `[CONFIRMED]`
- [ ] **WhatsApp webhook returns 200 on error** — valid token but ingest throws; verify 200 still returned `[CONFIRMED]`
- [ ] **WhatsApp webhook captures Sentry on error** — processing error; verify capture called `[CONFIRMED]`

### Bulk Notification Operations
- [ ] **Email batches of 20** — send 50 certs; verify 3 batches (20+20+10) `[CONFIRMED]`
- [ ] **30s sleep between email batches** — verify step.sleep called with '30s' between batches `[CONFIRMED]`
- [ ] **WhatsApp one-at-a-time** — send 5 certs via WhatsApp; verify 5 individual sends `[CONFIRMED]`
- [ ] **2s sleep between WhatsApp messages** — verify step.sleep called with '2s' between messages `[CONFIRMED]`
- [ ] **lastSentAt updated only on success** — 3 sent, 1 failed; verify lastSentAt set on 3, not on failed `[CONFIRMED]`
- [ ] **Sent/failed counts returned** — verify function returns {emailSent, emailFailed, whatsappSent, whatsappFailed} `[CONFIRMED]`
- [ ] **Uses sendNotification with idempotency** — verify each send uses unique idempotency key `[CONFIRMED]`
