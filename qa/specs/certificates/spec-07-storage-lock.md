# Spec: Storage Provider & Distributed Lock

Module: certificates
Area: R2 Storage, Redis Lock

## Checkpoints

### CP-82: Storage key format includes eventId for isolation
- **Action**: Call buildCertificateStorageKey('evt-1', 'delegate_attendance', 'cert-1')
- **Expected**: Key contains 'evt-1' path segment
- **Pass criteria**: Format: certificates/{eventId}/{type}/{certId}.pdf

### CP-83: Stub provider upload and signed URL round-trip
- **Action**: Upload buffer via stub, get signed URL
- **Expected**: URL generated for uploaded file
- **Pass criteria**: URL contains storage key

### CP-84: Stub provider throws for non-existent key
- **Action**: Call getSignedUrl on stub for key that wasn't uploaded
- **Expected**: Error thrown
- **Pass criteria**: Error indicates not found

### CP-85: Stub provider delete removes file
- **Action**: Upload file, delete it, attempt getSignedUrl
- **Expected**: Error on getSignedUrl after delete
- **Pass criteria**: File fully removed

### CP-86: Upload computes SHA-256 checksum
- **Action**: Upload known buffer
- **Expected**: fileChecksumSha256 matches expected hash
- **Pass criteria**: Deterministic checksum

### CP-87: Lock acquire returns handle on success
- **Action**: Acquire lock on unused key
- **Expected**: Returns {key, ownerToken} where ownerToken is UUID
- **Pass criteria**: Non-null handle returned

### CP-88: Lock acquire returns null if already held
- **Action**: Acquire lock, attempt second acquire on same key
- **Expected**: Second returns null
- **Pass criteria**: First lock not disrupted

### CP-89: Lock release only works with correct owner token
- **Action**: Acquire lock, attempt release with wrong token
- **Expected**: Lock not released
- **Pass criteria**: Original holder retains lock

### CP-90: Lock renew extends TTL
- **Action**: Acquire lock, renew with valid handle
- **Expected**: Returns true, lock remains held
- **Pass criteria**: Lock survives beyond original TTL

### CP-91: Lock renew fails with wrong owner token
- **Action**: Acquire lock, attempt renew with different token
- **Expected**: Returns false
- **Pass criteria**: TTL not extended

### CP-92: buildLockKey throws for missing params
- **Action**: Call buildLockKey with empty eventId
- **Expected**: Error thrown
- **Pass criteria**: Validation catches missing param
