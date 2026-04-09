# Spec: Certificate Notification Resend

Module: certificates
Area: Resend Flow, Idempotency

## Checkpoints

### CP-121: Resend email notification for issued certificate
- **Action**: Call resendCertificateNotification with channel='email'
- **Expected**: Notification dispatched, lastSentAt updated
- **Pass criteria**: Email sent via notification system

### CP-122: Resend blocked for revoked certificate
- **Action**: Revoke cert, attempt resend
- **Expected**: Error thrown
- **Pass criteria**: Error indicates cert not in issued status

### CP-123: Resend blocked for cert without storageKey
- **Action**: Cert without storageKey, attempt resend
- **Expected**: Error thrown
- **Pass criteria**: Error indicates PDF not generated

### CP-124: Idempotency key includes timestamp for uniqueness
- **Action**: Resend same cert twice
- **Expected**: Both dispatched (different timestamps in idempotency key)
- **Pass criteria**: Format: cert-resend-{id}-{channel}-{timestamp}

### CP-125: Resend supports channel='both' (email+whatsapp)
- **Action**: Call with channel='both'
- **Expected**: Both channels dispatched
- **Pass criteria**: Two notifications sent
