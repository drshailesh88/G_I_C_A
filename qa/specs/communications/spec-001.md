# communications — Spec 001

STATUS: PASSING
TESTED: 20/20
PASS: 20
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Send Orchestration
#### Channel Routing
- [x] **Email send succeeds** — call sendNotification with channel='email', valid input; verify status='sent' and providerMessageId returned `[CONFIRMED]`
- [x] **WhatsApp send succeeds** — call sendNotification with channel='whatsapp', valid input; verify status='sent' and provider='evolution_api' `[CONFIRMED]`
- [x] **Provider routing email** — sendNotification with channel='email' calls emailProvider.send, not whatsAppProvider `[CONFIRMED]`
- [x] **Provider routing whatsapp** — sendNotification with channel='whatsapp' calls whatsAppProvider.sendText, not emailProvider `[CONFIRMED]`

#### Feature Flag Gate
- [x] **Channel disabled skips send** — disable email flag, call sendNotification; verify no provider call made and log created with CHANNEL_DISABLED body `[CONFIRMED]`
- [x] **Channel disabled creates audit log** — disable whatsapp flag, send; verify log row exists with status='sent' (intentional skip) `[CONFIRMED]`
- [x] **Flag check best-effort** — simulate Redis error on flag check; verify send proceeds normally (not blocked) `[CONFIRMED]`

#### Template Rendering
- [x] **Template render before side effects** — verify renderTemplate called before createLogEntry in normal flow `[CONFIRMED]`
- [x] **Render failure creates failed log** — inject template error; verify log row created with status='failed' and RENDER_FAILED in body `[CONFIRMED]`
- [x] **Render failure captures Sentry** — inject template error; verify captureNotificationError called with errorCode='RENDER_FAILED' `[CONFIRMED]`

#### Idempotency
- [x] **Log created before idempotency check** — verify createLogEntry called before idempotencyService.checkAndSet `[CONFIRMED]`
- [x] **Duplicate key returns sent** — set idempotency to return true (duplicate); verify result.status='sent' and no provider call `[CONFIRMED]`
- [x] **Duplicate recorded with code** — on duplicate, verify log updated with lastErrorCode='IDEMPOTENCY_DUPLICATE' `[CONFIRMED]`

#### Provider Error Handling
- [x] **Provider timeout recorded** — inject ProviderTimeoutError; verify log status='failed' with lastErrorCode='PROVIDER_TIMEOUT' `[CONFIRMED]`
- [x] **Provider exception recorded** — inject generic Error; verify log status='failed' with lastErrorCode='PROVIDER_EXCEPTION' `[CONFIRMED]`
- [x] **Provider failure captures Sentry** — inject provider error; verify captureNotificationError called `[CONFIRMED]`
- [x] **Accepted response sets sent with timestamp** — provider returns accepted=true; verify status='sent' and sentAt is set `[CONFIRMED]`
- [x] **Rejected response sets failed** — provider returns accepted=false; verify status='failed' with PROVIDER_REJECTED code `[CONFIRMED]`
- [x] **From display name from branding** — send email with branding emailSenderName; verify emailProvider.send receives fromDisplayName `[CONFIRMED]`
- [x] **WhatsApp prefix prepended** — send whatsapp with branding whatsappPrefix='[GEM]'; verify body starts with prefix `[CONFIRMED]`
