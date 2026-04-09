# communications — Spec 005

STATUS: PENDING
TESTED: 0/22
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Template System
#### Template Resolution
- [ ] **Event-specific overrides global** — create both event and global template; verify event-specific returned `[CONFIRMED]`
- [ ] **Falls back to global** — no event-specific template; verify global template (eventId=null) returned `[CONFIRMED]`
- [ ] **Only active templates** — create archived template; verify it is NOT returned by resolveTemplate `[CONFIRMED]`
- [ ] **No template throws** — request nonexistent templateKey; verify error 'No active template found' `[CONFIRMED]`

#### Variable Interpolation
- [ ] **Simple variable** — interpolate '{{fullName}}' with {fullName:'Jane'}; verify output 'Jane' `[CONFIRMED]`
- [ ] **Nested dot-notation** — interpolate '{{branding.primaryColor}}' with {branding:{primaryColor:'#fff'}}; verify '#fff' `[CONFIRMED]`
- [ ] **Missing variable becomes empty** — interpolate '{{missing}}' with {}; verify output is '' `[CONFIRMED]`
- [ ] **Null variable becomes empty** — interpolate '{{val}}' with {val:null}; verify output is '' `[CONFIRMED]`
- [ ] **Prototype access blocked** — interpolate '{{__proto__}}' or '{{constructor}}'; verify returns '' not object `[CONFIRMED]`
- [ ] **Required variables validated** — template requires ['fullName','eventName'], provide only fullName; verify 'eventName' in missing list `[CONFIRMED]`
- [ ] **All required present passes** — provide all required vars; verify empty missing array `[CONFIRMED]`

#### Event Branding
- [ ] **Default mode loads from event** — template with brandingMode='default'; verify branding loaded from events table `[CONFIRMED]`
- [ ] **Custom mode uses template JSON** — template with brandingMode='custom' and customBrandingJson; verify custom values used `[CONFIRMED]`
- [ ] **Custom mode null JSON uses defaults** — brandingMode='custom' with null customBrandingJson; verify DEFAULT_BRANDING used `[CONFIRMED]`
- [ ] **Invalid branding falls back to defaults** — store invalid hex color in branding; verify no crash, defaults used `[CONFIRMED]`
- [ ] **Missing event throws** — render template for nonexistent eventId; verify error 'Event not found' `[CONFIRMED]`
- [ ] **CRLF stripped from sender name** — branding with emailSenderName containing \r\n; verify control chars removed `[CONFIRMED]`
- [ ] **Logo URL resolved via R2** — branding with logoStorageKey; verify signed URL generated with 1h expiry `[CONFIRMED]`
- [ ] **Header image URL resolved** — branding with headerImageStorageKey; verify signed URL generated `[CONFIRMED]`
- [ ] **WhatsApp prefix prepended** — branding with whatsappPrefix='[GEM]'; verify body starts with '[GEM]\n\n' `[CONFIRMED]`
- [ ] **No prefix when empty** — branding with whatsappPrefix=''; verify no prefix added to body `[CONFIRMED]`
- [ ] **Branding vars in template namespace** — verify {{branding.primaryColor}} resolvable in interpolation `[CONFIRMED]`
