# communications — Spec 001

STATUS: PENDING
TESTED: 0/20
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Send Orchestration
#### Channel Routing
- [ ] **Email send succeeds** — call sendNotification with channel='email', valid input; verify status='sent' and providerMessageId returned `[CONFIRMED]`
- [ ] **WhatsApp send succeeds** — call sendNotification with channel='whatsapp', valid input; verify status='sent' and provider='evolution_api' `[CONFIRMED]`
- [ ] **Provider routing email** — sendNotification with channel='email' calls emailProvider.send, not whatsAppProvider `[CONFIRMED]`
- [ ] **Provider routing whatsapp** — sendNotification with channel='whatsapp' calls whatsAppProvider.sendText, not emailProvider `[CONFIRMED]`

#### Feature Flag Gate
- [ ] **Channel disabled skips send** — disable email flag, call sendNotification; verify no provider call made and log created with CHANNEL_DISABLED body `[CONFIRMED]`
- [ ] **Channel disabled creates audit log** — disable whatsapp flag, send; verify log row exists with status='sent' (intentional skip) `[CONFIRMED]`
- [ ] **Flag check best-effort** — simulate Redis error on flag check; verify send proceeds normally (not blocked) `[CONFIRMED]`

#### Template Rendering
- [ ] **Template render before side effects** — verify renderTemplate called before createLogEntry in normal flow `[CONFIRMED]`
- [ ] **Render failure creates failed log** — inject template error; verify log row created with status='failed' and RENDER_FAILED in body `[CONFIRMED]`
- [ ] **Render failure captures Sentry** — inject template error; verify captureNotificationError called with errorCode='RENDER_FAILED' `[CONFIRMED]`

#### Idempotency
- [ ] **Log created before idempotency check** — verify createLogEntry called before idempotencyService.checkAndSet `[CONFIRMED]`
- [ ] **Duplicate key returns sent** — set idempotency to return true (duplicate); verify result.status='sent' and no provider call `[CONFIRMED]`
- [ ] **Duplicate recorded with code** — on duplicate, verify log updated with lastErrorCode='IDEMPOTENCY_DUPLICATE' `[CONFIRMED]`

#### Provider Error Handling
- [ ] **Provider timeout recorded** — inject ProviderTimeoutError; verify log status='failed' with lastErrorCode='PROVIDER_TIMEOUT' `[CONFIRMED]`
- [ ] **Provider exception recorded** — inject generic Error; verify log status='failed' with lastErrorCode='PROVIDER_EXCEPTION' `[CONFIRMED]`
- [ ] **Provider failure captures Sentry** — inject provider error; verify captureNotificationError called `[CONFIRMED]`
- [ ] **Accepted response sets sent with timestamp** — provider returns accepted=true; verify status='sent' and sentAt is set `[CONFIRMED]`
- [ ] **Rejected response sets failed** — provider returns accepted=false; verify status='failed' with PROVIDER_REJECTED code `[CONFIRMED]`
- [ ] **From display name from branding** — send email with branding emailSenderName; verify emailProvider.send receives fromDisplayName `[CONFIRMED]`
- [ ] **WhatsApp prefix prepended** — send whatsapp with branding whatsappPrefix='[GEM]'; verify body starts with prefix `[CONFIRMED]`
