# Spec: Certificate Download & Verification

Module: certificates
Area: Download URLs, Verification Flow

STATUS: COMPLETE
TESTED: 11/11
PASS: 11 (3 via Playwright E2E, 8 via vitest unit tests)
FAIL: 0
BLOCKED: 0

## Checkpoints

### CP-43: Download URL generated for issued certificate
- **Action**: Issue cert with storageKey, call getCertificateDownloadUrl
- **Expected**: Returns {url, fileName, expiresInSeconds: 3600}
- **Pass criteria**: URL is a signed R2 URL, fileName matches certificateNumber

### CP-44: Download blocked for revoked certificate
- **Action**: Issue and revoke cert, attempt download
- **Expected**: Error thrown
- **Pass criteria**: Error indicates revoked status

### CP-45: Download blocked for superseded certificate
- **Action**: Issue cert A, supersede with B, attempt download A
- **Expected**: Error thrown
- **Pass criteria**: Error indicates superseded status

### CP-46: Download blocked when storageKey missing
- **Action**: Certificate without storageKey (not yet generated), attempt download
- **Expected**: Error thrown
- **Pass criteria**: Error indicates certificate not generated

### CP-47: Download increments downloadCount
- **Action**: Download cert URL, check downloadCount
- **Expected**: downloadCount incremented, lastDownloadedAt updated
- **Pass criteria**: Count = previous + 1

### CP-48: Verify valid certificate by token
- **Action**: Issue cert, call verifyCertificate with its verificationToken
- **Expected**: {valid: true, certificateNumber, certificateType, issuedAt}
- **Pass criteria**: All fields correct

### CP-49: Verify revoked certificate returns invalid with details
- **Action**: Issue and revoke cert, verify by token
- **Expected**: {valid: false, error: 'revoked', certificateNumber, revokedAt}
- **Pass criteria**: Error indicates revocation, includes details

### CP-50: Verify superseded certificate returns invalid
- **Action**: Supersede cert, verify old token
- **Expected**: {valid: false, error: 'superseded'}
- **Pass criteria**: Clear superseded message

### CP-51: Verify non-existent token returns invalid
- **Action**: Call verifyCertificate with random UUID
- **Expected**: {valid: false, error: 'not found'}
- **Pass criteria**: No exception, just invalid result

### CP-52: Verification increments verificationCount
- **Action**: Verify cert twice
- **Expected**: verificationCount = 2, lastVerifiedAt updated
- **Pass criteria**: Counter correctly tracks

### CP-53: Verification is public (no auth required)
- **Action**: Call verifyCertificate without any auth context
- **Expected**: Works correctly
- **Pass criteria**: No auth error thrown
