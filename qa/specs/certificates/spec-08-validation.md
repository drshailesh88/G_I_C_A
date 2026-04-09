# Spec: Zod Validation Schemas

Module: certificates
Area: Input Validation

## Checkpoints

### CP-93: createCertificateTemplateSchema — valid input passes
- **Action**: Parse valid create input through schema
- **Expected**: Parsed successfully with defaults applied
- **Pass criteria**: pageSize defaults to A4_landscape, orientation to landscape

### CP-94: createCertificateTemplateSchema — templateName trimmed
- **Action**: Parse with templateName=" Test  "
- **Expected**: Trimmed to "Test"
- **Pass criteria**: Leading/trailing whitespace removed

### CP-95: createCertificateTemplateSchema — templateName max 200 chars
- **Action**: Parse with 201 character templateName
- **Expected**: Validation error
- **Pass criteria**: Error references max length

### CP-96: issueCertificateSchema — requires UUID format for personId
- **Action**: Parse with personId="not-a-uuid"
- **Expected**: Validation error
- **Pass criteria**: Error references UUID format

### CP-97: revokeCertificateSchema — reason min 1 char after trim
- **Action**: Parse with revokeReason="   " (whitespace only)
- **Expected**: Validation error
- **Pass criteria**: Error references minimum length

### CP-98: revokeCertificateSchema — reason max 2000 chars
- **Action**: Parse with 2001 character reason
- **Expected**: Validation error
- **Pass criteria**: Error references max length

### CP-99: bulkGenerateSchema — max 500 personIds
- **Action**: Parse with 501 personIds
- **Expected**: Validation error
- **Pass criteria**: Error references array max

### CP-100: bulkGenerateSchema — min 1 personId
- **Action**: Parse with empty personIds array
- **Expected**: Validation error
- **Pass criteria**: Error references array min
