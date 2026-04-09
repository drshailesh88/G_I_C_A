# communications — Spec 011

STATUS: BLOCKED
TESTED: 0/15
PASS: 0
FAIL: 0
BLOCKED: 15
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Webhook API Routes
- [ ] **Email webhook verifies Svix signature** — POST /api/webhooks/email with valid signature; verify 200 returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Email webhook rejects invalid signature** — POST with wrong signature; verify 401 returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Email webhook returns 200 on processing error** — valid signature but ingest throws; verify 200 still returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Email webhook captures Sentry on error** — processing error; verify captureNotificationError called `[CONFIRMED]` BLOCKED:needs-db
- [ ] **WhatsApp webhook verifies Bearer token** — POST /api/webhooks/whatsapp with valid token; verify 200 returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **WhatsApp webhook rejects invalid token** — POST with wrong token; verify 401 returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **WhatsApp webhook returns 200 on error** — valid token but ingest throws; verify 200 still returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **WhatsApp webhook captures Sentry on error** — processing error; verify capture called `[CONFIRMED]` BLOCKED:needs-db

### Bulk Notification Operations
- [ ] **Email batches of 20** — send 50 certs; verify 3 batches (20+20+10) `[CONFIRMED]` BLOCKED:needs-db
- [ ] **30s sleep between email batches** — verify step.sleep called with '30s' between batches `[CONFIRMED]` BLOCKED:needs-db
- [ ] **WhatsApp one-at-a-time** — send 5 certs via WhatsApp; verify 5 individual sends `[CONFIRMED]` BLOCKED:needs-db
- [ ] **2s sleep between WhatsApp messages** — verify step.sleep called with '2s' between messages `[CONFIRMED]` BLOCKED:needs-db
- [ ] **lastSentAt updated only on success** — 3 sent, 1 failed; verify lastSentAt set on 3, not on failed `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Sent/failed counts returned** — verify function returns {emailSent, emailFailed, whatsappSent, whatsappFailed} `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Uses sendNotification with idempotency** — verify each send uses unique idempotency key `[CONFIRMED]` BLOCKED:needs-db
