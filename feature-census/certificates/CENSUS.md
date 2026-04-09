# Feature Census: Certificates Module

## Summary

| Metric | Count |
|--------|-------|
| Total capabilities | 47 |
| From your code | 38 |
| From libraries (emergent) | 9 |

---

## 1. Template Management

| # | Capability | Source | File |
|---|-----------|--------|------|
| 1 | Create certificate template (draft) | code | `src/lib/actions/certificate.ts` |
| 2 | Update certificate template metadata | code | `src/lib/actions/certificate.ts` |
| 3 | Update template JSON (pdfme format) | code | `src/lib/actions/certificate.ts` |
| 4 | Activate template (archives others of same type) | code | `src/lib/actions/certificate.ts` |
| 5 | Archive template | code | `src/lib/actions/certificate.ts` |
| 6 | List templates for event | code | `src/lib/actions/certificate.ts` |
| 7 | Get single template | code | `src/lib/actions/certificate.ts` |
| 8 | Template status transitions (draft->active->archived->draft) | code | `src/lib/validations/certificate.ts` |
| 9 | One-active-per-event-type constraint | code | `src/lib/db/schema/certificates.ts` |
| 10 | Version bumping on active template changes | code | `src/lib/actions/certificate.ts` |

## 2. Certificate Types

| # | Capability | Source | File |
|---|-----------|--------|------|
| 11 | 7 certificate types (delegate, faculty, speaker, chair, panelist, moderator, CME) | code | `src/lib/certificates/certificate-types.ts` |
| 12 | Certificate number generation (GEM{YEAR}-{PREFIX}-{SEQ}) | code | `src/lib/certificates/certificate-types.ts` |
| 13 | Certificate number parsing | code | `src/lib/certificates/certificate-types.ts` |
| 14 | Prefix uniqueness per type | code | `src/lib/certificates/certificate-types.ts` |
| 15 | Per-type default/required variables | code | `src/lib/certificates/certificate-types.ts` |

## 3. Single Issuance

| # | Capability | Source | File |
|---|-----------|--------|------|
| 16 | Issue single certificate | code | `src/lib/actions/certificate-issuance.ts` |
| 17 | One-current-per-person-event-type enforcement | code | `src/lib/actions/certificate-issuance.ts` |
| 18 | Supersession chain (old->new linking) | code | `src/lib/certificates/issuance-utils.ts` |
| 19 | Certificate number collision retry | code | `src/lib/actions/certificate-issuance.ts` |
| 20 | Revoke certificate with reason | code | `src/lib/actions/certificate-issuance.ts` |
| 21 | List issued certificates (with joins) | code | `src/lib/actions/certificate-issuance.ts` |
| 22 | Get single issued certificate | code | `src/lib/actions/certificate-issuance.ts` |
| 23 | Download URL (signed R2) | code | `src/lib/actions/certificate-issuance.ts` |
| 24 | Resend notification via Inngest | code | `src/lib/actions/certificate-issuance.ts` |
| 25 | Sequence number calculation | code | `src/lib/certificates/issuance-utils.ts` |

## 4. Bulk Generation

| # | Capability | Source | File |
|---|-----------|--------|------|
| 26 | Get eligible recipients (4 types: delegates, faculty, attendees, custom) | code | `src/lib/actions/certificate-generation.ts` |
| 27 | Queue bulk generation via Inngest | code | `src/lib/actions/certificate-generation.ts` |
| 28 | Batch processing (50 per step) | code | `src/lib/inngest/bulk-functions.ts` |
| 29 | PDF rendering via pdfme | library | `src/lib/inngest/bulk-functions.ts` |
| 30 | Send bulk notifications (email/WhatsApp) | code | `src/lib/actions/certificate-generation.ts` |
| 31 | Feature flag gating | code | `src/lib/actions/certificate-generation.ts` |

## 5. Bulk ZIP Download

| # | Capability | Source | File |
|---|-----------|--------|------|
| 32 | Bulk ZIP download with distributed lock | code | `src/lib/actions/certificate-bulk-zip.ts` |
| 33 | ZIP creation (streaming archiver) | library | `src/lib/certificates/bulk-zip.ts` |
| 34 | File deduplication (numbered suffixes) | code | `src/lib/certificates/bulk-zip.ts` |
| 35 | Zip Slip prevention (path sanitization) | code | `src/lib/certificates/bulk-zip.ts` |
| 36 | Aggregate size validation (200MB max) | code | `src/lib/certificates/bulk-zip.ts` |

## 6. Storage & Security

| # | Capability | Source | File |
|---|-----------|--------|------|
| 37 | R2 upload (PDF buffer) | library | `src/lib/certificates/storage.ts` |
| 38 | R2 stream upload (multipart) | library | `src/lib/certificates/storage.ts` |
| 39 | Signed URL generation (1hr expiry) | library | `src/lib/certificates/storage.ts` |
| 40 | R2 delete | library | `src/lib/certificates/storage.ts` |
| 41 | Distributed lock acquire/release/renew (Redis) | code | `src/lib/certificates/distributed-lock.ts` |

## 7. Public Verification

| # | Capability | Source | File |
|---|-----------|--------|------|
| 42 | Verify certificate by token | code | `src/lib/actions/certificate-issuance.ts` |
| 43 | Verification counter tracking | code | `src/lib/actions/certificate-issuance.ts` |

## 8. Exports & Backups

| # | Capability | Source | File |
|---|-----------|--------|------|
| 44 | Event archive ZIP (agenda, certs, notification log) | code | `src/lib/exports/archive.ts` |
| 45 | Emergency kit ZIP (attendees, travel, rooming, transport, schedule, certs) | code | `src/lib/exports/emergency-kit.ts` |
| 46 | Pre-event backup cron (48h window) | code | `src/lib/inngest/functions.ts` |

## 9. UI

| # | Capability | Source | File |
|---|-----------|--------|------|
| 47 | Visual PDF template editor (pdfme Designer) | library | `src/app/(app)/events/[eventId]/certificates/editor/[templateId]/editor-client.tsx` |

## 10. Validation

All inputs validated with Zod schemas in `src/lib/validations/certificate.ts`:
- Template create/update/activate/archive
- Single issuance
- Revocation (reason required)
- Bulk generation (max 500)

## Existing Test Coverage

13 test files covering:
- Validation schemas
- Certificate types & number generation
- Issuance utilities (pure logic)
- Bulk ZIP utilities
- Distributed lock
- Storage provider
- Template CRUD actions
- Issuance actions
- Generation actions
- Bulk ZIP actions
- UI: certificates client, generation client, editor client
