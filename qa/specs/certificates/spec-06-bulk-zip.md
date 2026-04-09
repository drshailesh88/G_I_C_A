# Spec: Bulk ZIP Download

Module: certificates
Area: ZIP Archive, Distributed Lock, Size Limits

## Checkpoints

### CP-68: Bulk ZIP creates archive of issued certificates
- **Action**: Issue 3 certs with storageKeys, call bulkZipDownload
- **Expected**: Returns {zipUrl, fileCount: 3, zipSizeBytes > 0}
- **Pass criteria**: ZIP URL is signed, contains 3 PDF files

### CP-69: Bulk ZIP filters to only issued status
- **Action**: Issue 3 certs, revoke 1, call bulkZipDownload
- **Expected**: ZIP contains 2 files (excludes revoked)
- **Pass criteria**: fileCount = 2

### CP-70: Bulk ZIP filters out certs without storageKey
- **Action**: Issue certs where some lack storageKey
- **Expected**: Only certs with storageKey included
- **Pass criteria**: Partial certs excluded gracefully

### CP-71: Bulk ZIP deduplicates file names
- **Action**: Issue certs that would produce same fileName
- **Expected**: Files renamed with -2, -3 suffixes
- **Pass criteria**: No overwritten files in ZIP

### CP-72: Bulk ZIP rejects > 500 certificates
- **Action**: Create scenario with 501 issued certs
- **Expected**: Validation error before ZIP creation
- **Pass criteria**: Error references 500 limit

### CP-73: Bulk ZIP rejects aggregate size > 200MB
- **Action**: Certs with total fileSizeBytes exceeding 200MB
- **Expected**: Validation error
- **Pass criteria**: Error references size limit

### CP-74: Distributed lock prevents concurrent ZIP generation
- **Action**: Call bulkZipDownload while lock is held
- **Expected**: Error thrown immediately
- **Pass criteria**: Error indicates "already in progress"

### CP-75: Distributed lock released after success
- **Action**: Call bulkZipDownload, verify lock released after
- **Expected**: Lock not held after successful completion
- **Pass criteria**: Subsequent call can acquire lock

### CP-76: Distributed lock released after failure
- **Action**: Call bulkZipDownload that fails mid-operation
- **Expected**: Lock released in finally block
- **Pass criteria**: Lock not orphaned

### CP-77: Different certificate types can ZIP concurrently
- **Action**: Call bulkZipDownload for type A and type B simultaneously
- **Expected**: Both succeed (different lock keys)
- **Pass criteria**: No lock conflict

### CP-78: ZIP Slip prevention — path traversal stripped
- **Action**: Certificate with fileName containing '../../../etc/passwd'
- **Expected**: Path separators stripped, safe name used
- **Pass criteria**: No directory traversal in ZIP

### CP-79: Uses uploadStream when provider supports it
- **Action**: Call bulkZipDownload with provider that has uploadStream
- **Expected**: Stream upload used (no full buffer in memory)
- **Pass criteria**: uploadStream called, not upload

### CP-80: Falls back to buffered upload when no uploadStream
- **Action**: Call bulkZipDownload with provider without uploadStream
- **Expected**: Full buffer upload used
- **Pass criteria**: upload called with Buffer

### CP-81: Lock renewed during large operations
- **Action**: Generate ZIP for 10+ files
- **Expected**: lock.renew called every 10 files
- **Pass criteria**: TTL extended to prevent expiry during long ops
