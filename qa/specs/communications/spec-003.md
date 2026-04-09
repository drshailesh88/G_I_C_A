# communications — Spec 003

STATUS: PASSING
TESTED: 20/20
PASS: 20
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Email Provider (Resend)
- [x] **Email send returns accepted** — call resendEmailProvider.send with valid input; verify accepted=true and provider='resend' `[CONFIRMED]`
- [x] **Email send returns provider message ID** — verify providerMessageId from Resend response is captured `[CONFIRMED]`
- [x] **Custom from display name** — send with fromDisplayName='Test Org'; verify from header includes 'Test Org' `[CONFIRMED]`
- [x] **Default from address** — send without fromDisplayName; verify from is 'GEM India <noreply@gemindia.org>' or env value `[CONFIRMED]`
- [x] **HTML body sent** — verify htmlBody passed to Resend SDK `[CONFIRMED]`
- [x] **Plaintext body sent** — send with textBody; verify text field passed to Resend `[CONFIRMED]`
- [x] **Metadata as headers** — send with metadata; verify headers passed to Resend `[CONFIRMED]`
- [x] **Resend API error returns rejected** — simulate Resend error response; verify accepted=false and rawStatus contains error `[CONFIRMED]`
- [x] **Email timeout at 10s** — verify withTimeout called with PROVIDER_TIMEOUTS.RESEND_EMAIL (10000ms) `[CONFIRMED]`

### Email Attachments
- [x] **Attachment resolved via R2 signed URL** — send with attachment; verify R2 getSignedUrl called with storageKey `[CONFIRMED]`
- [x] **Attachment URL expiry 15 minutes** — verify signed URL requested with 900 seconds expiry `[CONFIRMED]`
- [x] **Multiple attachments resolved** — send with 3 attachments; verify all 3 get signed URLs `[CONFIRMED]`
- [x] **Empty attachments array skipped** — send with attachments=[]; verify no R2 calls made `[CONFIRMED]`
- [x] **Filename path traversal stripped** — attachment with fileName='../../etc/passwd'; verify sanitized to 'etc/passwd' or 'passwd' `[CONFIRMED]`
- [x] **Filename null bytes stripped** — attachment with fileName='test\0.pdf'; verify null bytes removed `[CONFIRMED]`
- [x] **Filename leading dots stripped** — attachment with fileName='..hidden'; verify leading dots removed `[CONFIRMED]`
- [x] **Filename 255 char limit** — attachment with 300-char fileName; verify truncated to 255 `[CONFIRMED]`
- [x] **Empty filename defaults to 'attachment'** — attachment with fileName=''; verify sanitized to 'attachment' `[CONFIRMED]`
- [x] **Invalid storageKey throws** — attachment with null bytes in storageKey; verify error thrown `[CONFIRMED]`
- [x] **Missing fileName throws** — attachment with empty fileName; verify error thrown `[CONFIRMED]`
