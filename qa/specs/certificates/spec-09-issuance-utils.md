# Spec: Issuance Utility Functions

Module: certificates
Area: Pure Business Logic (DB-free)

STATUS: COMPLETE
TESTED: 20/20
PASS: 20 (vitest unit tests)
FAIL: 0
BLOCKED: 0

## Checkpoints

### CP-101: findCurrentCertificate returns issued cert matching criteria
- **Action**: Call with array containing matching cert (status='issued', matching person/event/type)
- **Expected**: Returns the matching cert
- **Pass criteria**: Correct cert returned

### CP-102: findCurrentCertificate returns null when no match
- **Action**: Call with empty array or no matching criteria
- **Expected**: Returns null
- **Pass criteria**: No false positives

### CP-103: findCurrentCertificate ignores revoked/superseded certs
- **Action**: Call with array where only matching cert has status='revoked'
- **Expected**: Returns null
- **Pass criteria**: Only 'issued' status considered current

### CP-104: buildSupersessionChain returns links for valid cert
- **Action**: Call with existing cert (status='issued')
- **Expected**: Returns oldCertUpdate with supersededById placeholder, newCertLink with supersedesId
- **Pass criteria**: Both objects non-null

### CP-105: buildSupersessionChain returns nulls for no existing cert
- **Action**: Call with null
- **Expected**: Both oldCertUpdate and newCertLink are null
- **Pass criteria**: Clean new issuance

### CP-106: buildSupersessionChain returns nulls for revoked cert
- **Action**: Call with cert where status='revoked'
- **Expected**: Both null (can't supersede revoked)
- **Pass criteria**: No supersession of revoked certs

### CP-107: validateRevocation rejects empty reason
- **Action**: Call with empty/whitespace revokeReason
- **Expected**: {valid: false, error: ...}
- **Pass criteria**: Error about empty reason

### CP-108: validateRevocation rejects already-revoked
- **Action**: Call with cert status='revoked'
- **Expected**: {valid: false, error: 'already revoked'}
- **Pass criteria**: Double revocation blocked

### CP-109: validateRevocation rejects superseded cert
- **Action**: Call with cert status='superseded'
- **Expected**: {valid: false, error: ...}
- **Pass criteria**: Error directs to revoke current cert instead

### CP-110: getNextSequence returns max+1
- **Action**: Call with existing numbers [GEM2026-ATT-00001, GEM2026-ATT-00005]
- **Expected**: Returns 6
- **Pass criteria**: Next sequence after highest existing

### CP-111: getNextSequence returns 1 for empty array
- **Action**: Call with empty existingNumbers
- **Expected**: Returns 1
- **Pass criteria**: Starts at 1

### CP-112: checkEligibility — delegate requires registration + attendance
- **Action**: Check delegate_attendance with hasConfirmedRegistration=true, hasEventAttendance=true
- **Expected**: {eligible: true}
- **Pass criteria**: Both conditions met

### CP-113: checkEligibility — delegate fails without attendance
- **Action**: Check delegate_attendance with hasConfirmedRegistration=true, hasEventAttendance=false
- **Expected**: {eligible: false, reason: ...}
- **Pass criteria**: Missing attendance blocks eligibility

### CP-114: checkEligibility — speaker requires assignment + role
- **Action**: Check speaker_recognition with hasSessionAssignment=true, assignmentRoles=['speaker']
- **Expected**: {eligible: true}
- **Pass criteria**: Correct role check

### CP-115: checkEligibility — CME requires session attendance count > 0
- **Action**: Check cme_attendance with hasSessionAttendance=true, sessionAttendanceCount=3
- **Expected**: {eligible: true}
- **Pass criteria**: Count threshold met

### CP-116: planBulkGeneration creates plan with correct sequences
- **Action**: Plan for 3 persons with no existing certs
- **Expected**: toIssue has 3 entries with sequential numbers (seq 1, 2, 3)
- **Pass criteria**: Auto-incrementing sequence

### CP-117: planBulkGeneration marks superseded certs
- **Action**: Plan for person who has existing cert
- **Expected**: toIssue entry includes supersedes link to existing cert
- **Pass criteria**: Supersession tracked in plan

### CP-118: validateDownloadAccess blocks revoked
- **Action**: Call with revoked cert
- **Expected**: {allowed: false, error: ...}
- **Pass criteria**: Download denied

### CP-119: validateDownloadAccess blocks superseded
- **Action**: Call with superseded cert
- **Expected**: {allowed: false, error: ...}
- **Pass criteria**: Download denied

### CP-120: validateDownloadAccess blocks missing storageKey
- **Action**: Call with cert where storageKey is null
- **Expected**: {allowed: false, error: ...}
- **Pass criteria**: Ungenerated cert can't be downloaded
