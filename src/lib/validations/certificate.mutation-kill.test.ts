import { describe, expect, it } from 'vitest';
import {
  createCertificateTemplateSchema,
  updateCertificateTemplateSchema,
  activateCertificateTemplateSchema,
  archiveCertificateTemplateSchema,
  issueCertificateSchema,
  revokeCertificateSchema,
  bulkGenerateSchema,
  CERTIFICATE_TYPES,
  AUDIENCE_SCOPES,
  PAGE_SIZES,
  ORIENTATIONS,
  TEMPLATE_STATUSES,
  CERTIFICATE_STATUSES,
  ELIGIBILITY_BASIS_TYPES,
} from './certificate';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

const validCreate = {
  templateName: 'Delegate Attendance Certificate',
  certificateType: 'delegate_attendance' as const,
  audienceScope: 'delegate' as const,
  templateJson: { schemas: [], basePdf: 'data:...' },
};

// ── Kill StringLiteral mutations on error messages ──────────────

describe('createCertificateTemplateSchema — exact error messages', () => {
  it('has exact error "Template name is required" for empty name (L51)', () => {
    const result = createCertificateTemplateSchema.safeParse({ ...validCreate, templateName: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('templateName'))?.message;
      expect(msg).toBe('Template name is required');
    }
  });

  it('has exact error "Variable name cannot be empty" for empty allowed variable (L57,58)', () => {
    const result = createCertificateTemplateSchema.safeParse({
      ...validCreate,
      allowedVariablesJson: [''],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('allowedVariablesJson'))?.message;
      expect(msg).toBe('Variable name cannot be empty');
    }
  });

  it('has exact refinement error message for required vars not in allowed (L70)', () => {
    const result = createCertificateTemplateSchema.safeParse({
      ...validCreate,
      allowedVariablesJson: ['full_name'],
      requiredVariablesJson: ['full_name', 'event_name'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('requiredVariablesJson'))?.message;
      expect(msg).toBe('All required variables must be included in allowed variables');
    }
  });
});

describe('updateCertificateTemplateSchema — exact error messages', () => {
  it('has exact "Invalid template ID" error on non-UUID (L77)', () => {
    const result = updateCertificateTemplateSchema.safeParse({ templateId: 'not-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('templateId'))?.message;
      expect(msg).toBe('Invalid template ID');
    }
  });

  it('rejects empty variable names in update allowedVariablesJson (L82)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      allowedVariablesJson: ['good', ''],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('allowedVariablesJson'))?.message;
      expect(msg).toBe('Variable name cannot be empty');
    }
  });

  it('rejects empty variable names in update requiredVariablesJson (L83)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      requiredVariablesJson: [''],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('requiredVariablesJson'))?.message;
      expect(msg).toBe('Variable name cannot be empty');
    }
  });
});

describe('activateCertificateTemplateSchema — exact errors', () => {
  it('has exact "Invalid template ID" error (L96)', () => {
    const result = activateCertificateTemplateSchema.safeParse({ templateId: 'bad' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid template ID');
    }
  });
});

describe('archiveCertificateTemplateSchema — exact errors', () => {
  it('has exact "Invalid template ID" error (L101)', () => {
    const result = archiveCertificateTemplateSchema.safeParse({ templateId: 'bad' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid template ID');
    }
  });
});

describe('issueCertificateSchema — exact errors', () => {
  it('has exact "Invalid person ID" error (L113)', () => {
    const result = issueCertificateSchema.safeParse({
      personId: 'bad',
      templateId: validUuid,
      certificateType: 'delegate_attendance',
      eligibilityBasisType: 'registration',
      renderedVariablesJson: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('personId'))?.message;
      expect(msg).toBe('Invalid person ID');
    }
  });

  it('has exact "Invalid template ID" error (L114)', () => {
    const result = issueCertificateSchema.safeParse({
      personId: validUuid,
      templateId: 'bad',
      certificateType: 'delegate_attendance',
      eligibilityBasisType: 'registration',
      renderedVariablesJson: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('templateId'))?.message;
      expect(msg).toBe('Invalid template ID');
    }
  });
});

describe('revokeCertificateSchema — exact errors', () => {
  it('has exact "Invalid certificate ID" error (L125)', () => {
    const result = revokeCertificateSchema.safeParse({
      certificateId: 'bad',
      revokeReason: 'reason',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('certificateId'))?.message;
      expect(msg).toBe('Invalid certificate ID');
    }
  });

  it('has exact "Revocation reason is required" error (L126)', () => {
    const result = revokeCertificateSchema.safeParse({
      certificateId: validUuid,
      revokeReason: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('revokeReason'))?.message;
      expect(msg).toBe('Revocation reason is required');
    }
  });
});

describe('bulkGenerateSchema — exact errors', () => {
  it('has exact "Invalid template ID" error (L133)', () => {
    const result = bulkGenerateSchema.safeParse({
      templateId: 'bad',
      certificateType: 'delegate_attendance',
      personIds: [validUuid],
      eligibilityBasisType: 'registration',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('templateId'))?.message;
      expect(msg).toBe('Invalid template ID');
    }
  });

  it('has exact "At least one person required" error for empty array (L135)', () => {
    const result = bulkGenerateSchema.safeParse({
      templateId: validUuid,
      certificateType: 'delegate_attendance',
      personIds: [],
      eligibilityBasisType: 'registration',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('personIds'))?.message;
      expect(msg).toBe('At least one person required');
    }
  });

  it('has exact "Max 500 per batch" error for oversized array (L135)', () => {
    const tooMany = Array.from({ length: 501 }, () => validUuid);
    const result = bulkGenerateSchema.safeParse({
      templateId: validUuid,
      certificateType: 'delegate_attendance',
      personIds: tooMany,
      eligibilityBasisType: 'registration',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i => i.path.includes('personIds'))?.message;
      expect(msg).toBe('Max 500 per batch');
    }
  });
});

// ── Kill MethodExpression mutations (.trim, .max, .min, .optional) ──

describe('trim() mutation kills', () => {
  it('trims whitespace from variable names in allowedVariablesJson (L58)', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      allowedVariablesJson: ['  full_name  '],
      requiredVariablesJson: ['full_name'],
    });
    expect(result.allowedVariablesJson[0]).toBe('full_name');
  });

  it('trims whitespace from variable names in requiredVariablesJson (L58)', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      allowedVariablesJson: ['full_name'],
      requiredVariablesJson: ['  full_name  '],
    });
    expect(result.requiredVariablesJson[0]).toBe('full_name');
  });

  it('trims verificationText (L63)', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      verificationText: '  Scan to verify  ',
    });
    expect(result.verificationText).toBe('Scan to verify');
  });

  it('trims notes (L64)', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      notes: '  Conference notes  ',
    });
    expect(result.notes).toBe('Conference notes');
  });

  it('trims defaultFileNamePattern (L59)', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      defaultFileNamePattern: '  pattern.pdf  ',
    });
    expect(result.defaultFileNamePattern).toBe('pattern.pdf');
  });
});

describe('max() mutation kills', () => {
  it('rejects defaultFileNamePattern > 500 chars (L59,84)', () => {
    const result = createCertificateTemplateSchema.safeParse({
      ...validCreate,
      defaultFileNamePattern: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts defaultFileNamePattern of exactly 500 chars', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      defaultFileNamePattern: 'x'.repeat(500),
    });
    expect(result.defaultFileNamePattern).toBe('x'.repeat(500));
  });

  it('rejects verificationText > 500 chars (L63)', () => {
    const result = createCertificateTemplateSchema.safeParse({
      ...validCreate,
      verificationText: 'v'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects notes > 2000 chars (L64)', () => {
    const result = createCertificateTemplateSchema.safeParse({
      ...validCreate,
      notes: 'n'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects update templateName > 200 chars (L78)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      templateName: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects update defaultFileNamePattern > 500 chars (L84)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      defaultFileNamePattern: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects update verificationText > 500 chars (L88)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      verificationText: 'v'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects update notes > 2000 chars (L89)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      notes: 'n'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('min() mutation kills', () => {
  it('rejects update templateName that is empty after trim (L78)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      templateName: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only variable names in update allowedVariablesJson (L82)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      allowedVariablesJson: ['  '],
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only variable names in update requiredVariablesJson (L83)', () => {
    const result = updateCertificateTemplateSchema.safeParse({
      templateId: validUuid,
      requiredVariablesJson: ['  '],
    });
    expect(result.success).toBe(false);
  });
});

describe('optional() mutation kills', () => {
  it('allows omitting defaultFileNamePattern', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.defaultFileNamePattern).toBeUndefined();
  });

  it('allows omitting signatureConfigJson', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.signatureConfigJson).toBeUndefined();
  });

  it('allows omitting brandingSnapshotJson', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.brandingSnapshotJson).toBeUndefined();
  });

  it('allows omitting verificationText', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.verificationText).toBeUndefined();
  });

  it('allows omitting notes', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.notes).toBeUndefined();
  });

  it('allows omitting all optional update fields', () => {
    const result = updateCertificateTemplateSchema.parse({ templateId: validUuid });
    expect(result.templateName).toBeUndefined();
    expect(result.templateJson).toBeUndefined();
    expect(result.pageSize).toBeUndefined();
    expect(result.orientation).toBeUndefined();
  });
});

// ── Kill ArrayDeclaration mutation (default [] → []) ──

describe('default value mutation kills', () => {
  it('defaults allowedVariablesJson to empty array (L57)', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.allowedVariablesJson).toEqual([]);
    expect(Array.isArray(result.allowedVariablesJson)).toBe(true);
  });

  it('defaults requiredVariablesJson to empty array (L58)', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.requiredVariablesJson).toEqual([]);
    expect(Array.isArray(result.requiredVariablesJson)).toBe(true);
  });

  it('refinement passes when both allowed and required are empty (L70)', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      allowedVariablesJson: [],
      requiredVariablesJson: [],
    });
    expect(result.allowedVariablesJson).toEqual([]);
    expect(result.requiredVariablesJson).toEqual([]);
  });

  it('refinement passes when required is subset of allowed', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      allowedVariablesJson: ['full_name', 'event_name'],
      requiredVariablesJson: ['full_name'],
    });
    expect(result.requiredVariablesJson).toEqual(['full_name']);
  });
});

// ── Constant array values ──

describe('constant array exports', () => {
  it('CERTIFICATE_TYPES has 7 types', () => {
    expect(CERTIFICATE_TYPES).toHaveLength(7);
    expect(CERTIFICATE_TYPES).toContain('delegate_attendance');
    expect(CERTIFICATE_TYPES).toContain('cme_attendance');
  });

  it('AUDIENCE_SCOPES has 7 scopes', () => {
    expect(AUDIENCE_SCOPES).toHaveLength(7);
    expect(AUDIENCE_SCOPES).toContain('mixed');
  });

  it('TEMPLATE_STATUSES has 3 statuses', () => {
    expect(TEMPLATE_STATUSES).toEqual(['draft', 'active', 'archived']);
  });

  it('CERTIFICATE_STATUSES has 3 statuses', () => {
    expect(CERTIFICATE_STATUSES).toEqual(['issued', 'superseded', 'revoked']);
  });

  it('ELIGIBILITY_BASIS_TYPES has 5 types', () => {
    expect(ELIGIBILITY_BASIS_TYPES).toHaveLength(5);
    expect(ELIGIBILITY_BASIS_TYPES).toContain('manual');
  });

  it('PAGE_SIZES has A4_landscape and A4_portrait', () => {
    expect(PAGE_SIZES).toEqual(['A4_landscape', 'A4_portrait']);
  });

  it('ORIENTATIONS has landscape and portrait', () => {
    expect(ORIENTATIONS).toEqual(['landscape', 'portrait']);
  });
});

// ── Update schema trim/min kills ──

describe('updateCertificateTemplateSchema — trim kills', () => {
  it('trims templateName', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      templateName: '  Updated  ',
    });
    expect(result.templateName).toBe('Updated');
  });

  it('trims defaultFileNamePattern', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      defaultFileNamePattern: '  pattern.pdf  ',
    });
    expect(result.defaultFileNamePattern).toBe('pattern.pdf');
  });

  it('trims verificationText', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      verificationText: '  text  ',
    });
    expect(result.verificationText).toBe('text');
  });

  it('trims notes', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      notes: '  note  ',
    });
    expect(result.notes).toBe('note');
  });

  it('trims variable names in allowedVariablesJson', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      allowedVariablesJson: ['  var1  '],
    });
    expect(result.allowedVariablesJson![0]).toBe('var1');
  });

  it('trims variable names in requiredVariablesJson', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      requiredVariablesJson: ['  var1  '],
    });
    expect(result.requiredVariablesJson![0]).toBe('var1');
  });
});

// ── Revoke reason trim ──

describe('revokeCertificateSchema — trim kills', () => {
  it('trims the revoke reason', () => {
    const result = revokeCertificateSchema.parse({
      certificateId: validUuid,
      revokeReason: '  Issued in error  ',
    });
    expect(result.revokeReason).toBe('Issued in error');
  });

  it('rejects revoke reason of exactly max+1 (2001) chars', () => {
    const result = revokeCertificateSchema.safeParse({
      certificateId: validUuid,
      revokeReason: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

// ── Kill remaining StringLiteral on requiredVariablesJson inner schema (L58) ──

describe('createCertificateTemplateSchema — requiredVariablesJson inner validation', () => {
  it('rejects empty string in requiredVariablesJson with exact error message', () => {
    const result = createCertificateTemplateSchema.safeParse({
      ...validCreate,
      allowedVariablesJson: ['full_name'],
      requiredVariablesJson: [''],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find(i =>
        i.path.includes('requiredVariablesJson'),
      )?.message;
      expect(msg).toBe('Variable name cannot be empty');
    }
  });

  it('rejects whitespace-only string in requiredVariablesJson', () => {
    const result = createCertificateTemplateSchema.safeParse({
      ...validCreate,
      allowedVariablesJson: ['full_name'],
      requiredVariablesJson: ['   '],
    });
    expect(result.success).toBe(false);
  });
});
