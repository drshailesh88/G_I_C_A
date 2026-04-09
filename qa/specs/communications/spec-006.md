# communications — Spec 006

STATUS: PARTIAL
TESTED: 12/22
PASS: 12
FAIL: 0
BLOCKED: 10
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Template CRUD & Seeds
#### Template CRUD
- [ ] **Create template** — call createTemplate with valid input; verify row returned with id and versionNo=1 `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Update template content** — update bodyContent; verify versionNo incremented `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Update non-content field** — update templateName only; verify versionNo NOT incremented `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Update subject increments version** — update subjectLine; verify versionNo incremented `[CONFIRMED]` BLOCKED:needs-db
- [ ] **List templates includes event and global** — create event-specific and global templates; verify both returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Get template by ID** — create template, get by ID; verify correct template returned `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Archive template** — archive template; verify status='archived' `[CONFIRMED]` BLOCKED:needs-db
- [ ] **Create event override** — duplicate global template as event-specific; verify new row with same content but eventId set `[CONFIRMED]` BLOCKED:needs-db

#### System Templates
- [x] **All 12 template keys defined** — verify SYSTEM_TEMPLATE_SEEDS contains all 12 unique keys `[CONFIRMED]`
- [x] **24 total seeds (12 keys x 2 channels)** — verify SYSTEM_TEMPLATE_SEEDS.length === 24 `[CONFIRMED]`
- [x] **Each key has email + whatsapp** — for each key, verify both channels present `[CONFIRMED]`
- [ ] **Idempotent seeding** — run seedSystemTemplates twice; verify second run skips all, inserts 0 `[CONFIRMED]` BLOCKED:needs-db
- [ ] **First seed inserts all** — seed into empty DB; verify inserted count equals seed count `[CONFIRMED]` BLOCKED:needs-db

### Idempotency Service
- [x] **New key returns false** — checkAndSet with fresh key; verify returns false (not duplicate) `[CONFIRMED]`
- [x] **Existing key returns true** — checkAndSet same key twice; verify second call returns true (duplicate) `[CONFIRMED]`
- [x] **TTL defaults to 7 days** — verify SET called with ex=604800 `[CONFIRMED]`
- [x] **Custom TTL honored** — checkAndSet with ttlSeconds=60; verify SET called with ex=60 `[CONFIRMED]`
- [x] **Key prefix applied** — verify Redis key starts with 'notif:idem:' `[CONFIRMED]`
- [x] **Injectable Redis client** — createIdempotencyService with mock Redis; verify mock used `[CONFIRMED]`

### Timeout Utility
- [x] **Timeout triggers abort** — create withTimeout with 50ms, fn that takes 200ms; verify ProviderTimeoutError thrown `[CONFIRMED]`
- [x] **Fast fn returns result** — withTimeout with 1000ms, fn that returns in 10ms; verify result returned `[CONFIRMED]`
- [x] **Timer cleared on success** — verify clearTimeout called after successful completion `[CONFIRMED]`
