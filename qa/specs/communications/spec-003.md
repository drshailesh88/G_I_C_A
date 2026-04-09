# communications — Spec 003

STATUS: PENDING
TESTED: 0/20
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Email Provider (Resend)
- [ ] **Email send returns accepted** — call resendEmailProvider.send with valid input; verify accepted=true and provider='resend' `[CONFIRMED]`
- [ ] **Email send returns provider message ID** — verify providerMessageId from Resend response is captured `[CONFIRMED]`
- [ ] **Custom from display name** — send with fromDisplayName='Test Org'; verify from header includes 'Test Org' `[CONFIRMED]`
- [ ] **Default from address** — send without fromDisplayName; verify from is 'GEM India <noreply@gemindia.org>' or env value `[CONFIRMED]`
- [ ] **HTML body sent** — verify htmlBody passed to Resend SDK `[CONFIRMED]`
- [ ] **Plaintext body sent** — send with textBody; verify text field passed to Resend `[CONFIRMED]`
- [ ] **Metadata as headers** — send with metadata; verify headers passed to Resend `[CONFIRMED]`
- [ ] **Resend API error returns rejected** — simulate Resend error response; verify accepted=false and rawStatus contains error `[CONFIRMED]`
- [ ] **Email timeout at 10s** — verify withTimeout called with PROVIDER_TIMEOUTS.RESEND_EMAIL (10000ms) `[CONFIRMED]`

### Email Attachments
- [ ] **Attachment resolved via R2 signed URL** — send with attachment; verify R2 getSignedUrl called with storageKey `[CONFIRMED]`
- [ ] **Attachment URL expiry 15 minutes** — verify signed URL requested with 900 seconds expiry `[CONFIRMED]`
- [ ] **Multiple attachments resolved** — send with 3 attachments; verify all 3 get signed URLs `[CONFIRMED]`
- [ ] **Empty attachments array skipped** — send with attachments=[]; verify no R2 calls made `[CONFIRMED]`
- [ ] **Filename path traversal stripped** — attachment with fileName='../../etc/passwd'; verify sanitized to 'etc/passwd' or 'passwd' `[CONFIRMED]`
- [ ] **Filename null bytes stripped** — attachment with fileName='test\0.pdf'; verify null bytes removed `[CONFIRMED]`
- [ ] **Filename leading dots stripped** — attachment with fileName='..hidden'; verify leading dots removed `[CONFIRMED]`
- [ ] **Filename 255 char limit** — attachment with 300-char fileName; verify truncated to 255 `[CONFIRMED]`
- [ ] **Empty filename defaults to 'attachment'** — attachment with fileName=''; verify sanitized to 'attachment' `[CONFIRMED]`
- [ ] **Invalid storageKey throws** — attachment with null bytes in storageKey; verify error thrown `[CONFIRMED]`
- [ ] **Missing fileName throws** — attachment with empty fileName; verify error thrown `[CONFIRMED]`
