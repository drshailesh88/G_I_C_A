# Spec: Certificate Types & Number Generation

Module: certificates
Area: Type Registry & Certificate Numbers

## Checkpoints

### CP-18: All 7 certificate types registered
- **Action**: Call `getAllCertificateTypeConfigs()`
- **Expected**: Returns 7 configs
- **Pass criteria**: Count === 7, types match: delegate_attendance, faculty_participation, speaker_recognition, chairperson_recognition, panelist_recognition, moderator_recognition, cme_attendance

### CP-19: Each type has unique 3-letter prefix
- **Action**: Extract prefixes from all configs
- **Expected**: No duplicates: ATT, FAC, SPK, CHR, PNL, MOD, CME
- **Pass criteria**: Set of prefixes has size 7

### CP-20: Certificate number format GEM{YEAR}-{PREFIX}-{SEQUENCE}
- **Action**: Call `generateCertificateNumber('delegate_attendance', 42)`
- **Expected**: Returns `GEM2026-ATT-00042`
- **Pass criteria**: Matches regex `/^GEM\d{4}-[A-Z]{3}-\d{5}$/`

### CP-21: Certificate number sequence zero-padded to 5 digits
- **Action**: Generate numbers for sequences 1, 99999
- **Expected**: 00001 and 99999
- **Pass criteria**: Padding correct at boundaries

### CP-22: parseCertificateNumber round-trips correctly
- **Action**: Generate a number, parse it back
- **Expected**: {year, prefix, sequence} match inputs
- **Pass criteria**: All fields match

### CP-23: parseCertificateNumber returns null for invalid format
- **Action**: Parse "INVALID-123"
- **Expected**: Returns null
- **Pass criteria**: No exception, just null

### CP-24: getCertificateTypeConfig throws for unknown type
- **Action**: Call with invalid type string
- **Expected**: Error thrown
- **Pass criteria**: Error message references unknown type

### CP-25: Session-based types require session_title variable
- **Action**: Check requiredVariables for speaker, chairperson, panelist, moderator types
- **Expected**: All include 'session_title' in requiredVariables
- **Pass criteria**: 4/4 types have session_title

### CP-26: CME type requires cme_credits variable
- **Action**: Check requiredVariables for cme_attendance type
- **Expected**: Includes 'cme_credits'
- **Pass criteria**: cme_credits in requiredVariables

### CP-27: All types require certificate_number variable
- **Action**: Check requiredVariables for all 7 types
- **Expected**: All include 'certificate_number'
- **Pass criteria**: 7/7 types have certificate_number
