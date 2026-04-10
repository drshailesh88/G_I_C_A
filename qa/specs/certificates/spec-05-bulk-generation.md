# Spec: Bulk Certificate Generation

Module: certificates
Area: Recipient Queries, Async Generation, Notifications

STATUS: COMPLETE
TESTED: 14/14
PASS: 14 (vitest unit tests)
FAIL: 0
BLOCKED: 0

## Checkpoints

### CP-54: Get eligible recipients — all_delegates
- **Action**: Call getEligibleRecipients with recipientType='all_delegates'
- **Expected**: Returns confirmed delegates from eventRegistrations joined with people
- **Pass criteria**: Only confirmed+delegate category returned

### CP-55: Get eligible recipients — all_faculty
- **Action**: Call getEligibleRecipients with recipientType='all_faculty'
- **Expected**: Returns distinct persons from sessionAssignments
- **Pass criteria**: No duplicates, faculty only

### CP-56: Get eligible recipients — all_attendees
- **Action**: Call getEligibleRecipients with recipientType='all_attendees'
- **Expected**: Returns distinct persons from attendanceRecords
- **Pass criteria**: No duplicates

### CP-57: Get eligible recipients — custom
- **Action**: Call getEligibleRecipients with recipientType='custom' and specific personIds
- **Expected**: Returns only specified persons (event-scoped)
- **Pass criteria**: Count matches input IDs that exist in event

### CP-58: Bulk generate queues Inngest event
- **Action**: Call bulkGenerateCertificates with valid input
- **Expected**: Returns {queued: true, message: "...batches of 50"}
- **Pass criteria**: Inngest event dispatched with correct payload

### CP-59: Bulk generate requires active template
- **Action**: Attempt bulk generate with draft template
- **Expected**: Error thrown
- **Pass criteria**: Error indicates template must be active

### CP-60: Bulk generate respects feature flag
- **Action**: Disable certificate generation feature flag, attempt bulk generate
- **Expected**: Error thrown
- **Pass criteria**: Error indicates feature disabled

### CP-61: Bulk generate validates max 500 personIds
- **Action**: Attempt bulk generate with 501 personIds
- **Expected**: Validation error
- **Pass criteria**: Error references max limit

### CP-62: Send notifications queues Inngest event
- **Action**: Call sendCertificateNotifications with certificateIds and channel='email'
- **Expected**: Returns {queued: true}
- **Pass criteria**: Inngest event dispatched

### CP-63: Send notifications validates max 500 certificateIds
- **Action**: Attempt with 501 IDs
- **Expected**: Validation error
- **Pass criteria**: Error references max limit

### CP-64: Inngest batch processing handles 50-per-step
- **Action**: Queue 120 certificates for generation
- **Expected**: Processed in 3 batches (50+50+20) with step.sleep between
- **Pass criteria**: All 120 processed

### CP-65: Inngest bulk generation handles supersession per batch
- **Action**: Generate cert for person who already has one
- **Expected**: Old cert superseded, new cert linked
- **Pass criteria**: Supersession chain maintained in bulk flow

### CP-66: Inngest notification batches email 20-per-batch
- **Action**: Queue 25 email notifications
- **Expected**: 2 batches (20+5) with 30s sleep between
- **Pass criteria**: All 25 sent

### CP-67: Inngest notification filters certs without storageKey
- **Action**: Queue notification for cert without storageKey
- **Expected**: Cert skipped, not sent
- **Pass criteria**: No failed send attempt
