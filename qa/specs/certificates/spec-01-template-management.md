# Spec: Certificate Template Management

Module: certificates
Area: Template CRUD & State Machine

## Checkpoints

### CP-01: Create template with valid input
- **Action**: Call `createCertificateTemplate` with valid input including templateName, certificateType, audienceScope, templateJson
- **Expected**: Returns template with status='draft', versionNo=1, createdBy set
- **Pass criteria**: Template exists in DB with correct fields

### CP-02: Create template validates required fields
- **Action**: Call `createCertificateTemplate` with missing templateName
- **Expected**: Zod validation error thrown
- **Pass criteria**: Error message references templateName

### CP-03: Create template enforces requiredVariables subset of allowedVariables
- **Action**: Call `createCertificateTemplate` with requiredVariablesJson=['foo'] and allowedVariablesJson=[]
- **Expected**: Zod refinement error
- **Pass criteria**: Error thrown before DB insert

### CP-04: Update draft template
- **Action**: Create draft template, then call `updateCertificateTemplate` with new templateName
- **Expected**: Template updated, no version bump
- **Pass criteria**: templateName changed, versionNo still 1

### CP-05: Update active template JSON bumps version
- **Action**: Activate a template, then call `updateCertificateTemplate` with changed templateJson
- **Expected**: versionNo incremented atomically
- **Pass criteria**: versionNo = 2 after update

### CP-06: Block update on archived template
- **Action**: Archive a template, then call `updateCertificateTemplate`
- **Expected**: Error thrown
- **Pass criteria**: Error message indicates archived templates cannot be updated

### CP-07: Activate template archives others of same type
- **Action**: Create 2 draft templates of same certificateType, activate first, then activate second
- **Expected**: First becomes archived, second becomes active
- **Pass criteria**: Only one active template per event+type

### CP-08: Template status transition draft->active allowed
- **Action**: Create draft template, activate it
- **Expected**: Status changes to 'active'
- **Pass criteria**: No error, status='active'

### CP-09: Template status transition active->archived allowed
- **Action**: Activate template, then archive it
- **Expected**: Status changes to 'archived'
- **Pass criteria**: No error, status='archived'

### CP-10: Template status transition archived->draft allowed
- **Action**: Archive a template, then transition back to draft (if supported by action)
- **Expected**: Status changes to 'draft'
- **Pass criteria**: Template can be re-edited

### CP-11: Template status transition draft->archived allowed
- **Action**: Create draft, archive directly
- **Expected**: Status changes to 'archived'
- **Pass criteria**: No error

### CP-12: Illegal transition active->draft blocked
- **Action**: Activate template, attempt to transition to draft
- **Expected**: Error thrown
- **Pass criteria**: Template remains active

### CP-13: List templates returns all for event ordered by updatedAt DESC
- **Action**: Create 3 templates, update them in different order
- **Expected**: Returned in most-recently-updated-first order
- **Pass criteria**: Order matches updatedAt DESC

### CP-14: Get single template by ID
- **Action**: Create template, fetch by ID
- **Expected**: Full template data returned
- **Pass criteria**: All fields present

### CP-15: Get non-existent template throws
- **Action**: Call getCertificateTemplate with non-existent UUID
- **Expected**: Error thrown
- **Pass criteria**: Error indicates template not found

### CP-16: Default file name pattern applied
- **Action**: Create template without defaultFileNamePattern
- **Expected**: Defaults to '{{full_name}}-{{event_name}}-certificate.pdf'
- **Pass criteria**: Pattern matches default

### CP-17: eventId scoping prevents cross-event access
- **Action**: Create template in event A, attempt to fetch from event B
- **Expected**: Template not found
- **Pass criteria**: No data leakage between events
