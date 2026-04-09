# communications — Spec 004

STATUS: PASSING
TESTED: 17/17
PASS: 17
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### WhatsApp Provider (Evolution API)
#### Text Messages
- [x] **Text message sent** — call evolutionWhatsAppProvider.sendText with text; verify fetch called to /message/sendText `[CONFIRMED]`
- [x] **Phone leading + stripped** — send to '+919876543210'; verify number sent as '919876543210' `[CONFIRMED]`
- [x] **API key in headers** — verify apikey header set from EVOLUTION_API_KEY env `[CONFIRMED]`
- [x] **Provider message ID extracted** — verify key.id from response captured as providerMessageId `[CONFIRMED]`
- [x] **Fallback to messageId field** — response without key.id but with messageId; verify messageId captured `[CONFIRMED]`
- [x] **API error returns rejected** — simulate HTTP 500; verify accepted=false and rawStatus contains HTTP status `[CONFIRMED]`
- [x] **WhatsApp timeout at 15s** — verify withTimeout called with PROVIDER_TIMEOUTS.EVOLUTION_WHATSAPP (15000ms) `[CONFIRMED]`

#### Media Messages
- [x] **Media message when attachments present** — send with mediaAttachments; verify fetch to /message/sendMedia `[CONFIRMED]`
- [x] **Document type for PDF** — attachment with contentType='application/pdf'; verify mediatype='document' `[CONFIRMED]`
- [x] **Image type for JPEG** — attachment with contentType='image/jpeg'; verify mediatype='image' `[CONFIRMED]`
- [x] **Image type for PNG** — attachment with contentType='image/png'; verify mediatype='image' `[CONFIRMED]`
- [x] **Default to document type** — attachment with no contentType; verify mediatype='document' `[CONFIRMED]`
- [x] **Only first attachment sent** — send with 3 attachments; verify only first used, warning logged `[CONFIRMED]`
- [x] **Caption included with media** — send media with body text; verify caption field set `[CONFIRMED]`
- [x] **Media R2 signed URL** — verify R2 getSignedUrl called with 900s expiry for media `[CONFIRMED]`
- [x] **Media filename sanitized** — attachment with path traversal fileName; verify sanitized in request `[CONFIRMED]`
- [x] **Invalid media attachment throws** — attachment with null-byte storageKey; verify error thrown `[CONFIRMED]`
