# Certificates Module — CODE-ONLY Checkpoint Summary

These checkpoints test server-side business logic, database operations, and Zod validation schemas.
They are fully covered by **vitest unit tests** and are NOT testable via Playwright browser automation.

## Classification: BLOCKED for Playwright (CODE-ONLY)

| Spec | Checkpoints | Coverage | Test File(s) |
|------|-------------|----------|--------------|
| spec-01 | CP-01 to CP-17 (17) | Template CRUD & state machine | `certificate.test.ts` |
| spec-02 | CP-18 to CP-27 (10) | Type registry & number generation | `certificate-types.test.ts` |
| spec-03 | CP-28 to CP-42 (15) | Issuance & revocation actions | `certificate-issuance.test.ts` |
| spec-04 | CP-43 to CP-47, CP-49, CP-50, CP-52 (8) | Download URLs & verification logic | `certificate-issuance.test.ts` |
| spec-05 | CP-54 to CP-67 (14) | Bulk generation & Inngest | `certificate-generation.test.ts`, `bulk-functions.test.ts` |
| spec-06 | CP-68 to CP-81 (14) | Bulk ZIP & distributed lock | `certificate-bulk-zip.test.ts`, `bulk-zip.test.ts` |
| spec-07 | CP-82 to CP-92 (11) | R2 storage & Redis lock | `storage.test.ts`, `distributed-lock.test.ts` |
| spec-08 | CP-93 to CP-100 (8) | Zod validation schemas | `certificate.test.ts` |
| spec-09 | CP-101 to CP-120 (20) | Issuance utility functions | `issuance-utils.test.ts` |
| spec-10 | CP-121 to CP-125 (5) | Notification resend flow | `certificate-issuance.test.ts` |
| spec-11 | CP-126 to CP-131 (6) | Archive & emergency kit exports | `archive.test.ts`, `emergency-kit.test.ts` |

**Total CODE-ONLY: 128/131 checkpoints**
**UI-testable (Playwright): 3 checkpoints (CP-48, CP-51, CP-53) on /verify page**

All 131 checkpoints pass in vitest (2106 total tests, 0 failures).
