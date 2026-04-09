# Spec: Certificate Issuance & Revocation

Module: certificates
Area: Single Certificate Lifecycle

## Checkpoints

### CP-28: Issue certificate to person with active template
- **Action**: Create active template, issue certificate to a person
- **Expected**: Certificate created with status='issued', certificateNumber generated, verificationToken set
- **Pass criteria**: Certificate exists in DB with correct fields

### CP-29: Issue certificate requires active template
- **Action**: Attempt to issue with draft template
- **Expected**: Error thrown
- **Pass criteria**: Error indicates template must be active

### CP-30: Issue certificate requires person exists
- **Action**: Attempt to issue with non-existent personId
- **Expected**: Error thrown
- **Pass criteria**: Error indicates person not found

### CP-31: Supersession — issuing second cert supersedes first
- **Action**: Issue cert A to person, then issue cert B to same person+event+type
- **Expected**: Cert A status='superseded', cert A.supersededById=B.id, cert B.supersedesId=A.id
- **Pass criteria**: Supersession chain intact

### CP-32: One-current-valid enforcement
- **Action**: After issuing cert A then cert B (supersession), query current valid certs
- **Expected**: Only cert B has status='issued'
- **Pass criteria**: Exactly 1 issued cert per person/event/type

### CP-33: Cannot supersede revoked certificate
- **Action**: Issue cert, revoke it, issue new cert
- **Expected**: New cert created fresh (no supersession link to revoked cert)
- **Pass criteria**: New cert.supersedesId is null, revoked cert unchanged

### CP-34: Certificate number collision retry
- **Action**: Simulate collision on first attempt (unique constraint violation)
- **Expected**: Retries up to 3 times with incremented sequence
- **Pass criteria**: Certificate created despite initial collision

### CP-35: Revoke certificate with reason
- **Action**: Issue cert, revoke with reason "Incorrect details"
- **Expected**: status='revoked', revokedAt set, revokeReason='Incorrect details'
- **Pass criteria**: All revocation fields populated

### CP-36: Cannot revoke already-revoked certificate
- **Action**: Revoke cert, attempt to revoke again
- **Expected**: Error thrown
- **Pass criteria**: Error indicates already revoked

### CP-37: Cannot revoke superseded certificate
- **Action**: Issue cert A, supersede with cert B, attempt to revoke cert A
- **Expected**: Error thrown
- **Pass criteria**: Error indicates must revoke current certificate instead

### CP-38: Revocation requires non-empty reason
- **Action**: Attempt revoke with empty string reason
- **Expected**: Validation error
- **Pass criteria**: Error references revokeReason

### CP-39: List issued certificates joins person data
- **Action**: Issue certs to multiple people, call listIssuedCertificates
- **Expected**: Each result includes recipientName from people table
- **Pass criteria**: Person data joined correctly

### CP-40: List issued certificates ordered by issuedAt DESC
- **Action**: Issue 3 certs at different times
- **Expected**: Most recent first
- **Pass criteria**: Order matches issuedAt DESC

### CP-41: Get single certificate by ID
- **Action**: Issue cert, fetch by ID
- **Expected**: Full certificate data returned
- **Pass criteria**: All fields present

### CP-42: Get non-existent certificate throws
- **Action**: Fetch with non-existent UUID
- **Expected**: Error thrown
- **Pass criteria**: Not found error
