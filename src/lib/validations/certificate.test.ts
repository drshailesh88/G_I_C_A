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
  TEMPLATE_STATUS_TRANSITIONS,
} from './certificate';

const validCreate = {
  templateName: 'Delegate Attendance Certificate',
  certificateType: 'delegate_attendance' as const,
  audienceScope: 'delegate' as const,
  templateJson: { schemas: [], basePdf: 'data:...' },
};

describe('createCertificateTemplateSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = createCertificateTemplateSchema.parse(validCreate);
    expect(result.templateName).toBe('Delegate Attendance Certificate');
    expect(result.certificateType).toBe('delegate_attendance');
    expect(result.audienceScope).toBe('delegate');
    expect(result.pageSize).toBe('A4_landscape');
    expect(result.orientation).toBe('landscape');
    expect(result.allowedVariablesJson).toEqual([]);
    expect(result.requiredVariablesJson).toEqual([]);
    expect(result.qrVerificationEnabled).toBe(true);
  });

  it('accepts all certificate types', () => {
    for (const type of CERTIFICATE_TYPES) {
      const result = createCertificateTemplateSchema.parse({ ...validCreate, certificateType: type });
      expect(result.certificateType).toBe(type);
    }
  });

  it('accepts all audience scopes', () => {
    for (const scope of AUDIENCE_SCOPES) {
      const result = createCertificateTemplateSchema.parse({ ...validCreate, audienceScope: scope });
      expect(result.audienceScope).toBe(scope);
    }
  });

  it('rejects empty template name', () => {
    expect(() => createCertificateTemplateSchema.parse({ ...validCreate, templateName: '' })).toThrow();
  });

  it('rejects invalid certificate type', () => {
    expect(() => createCertificateTemplateSchema.parse({ ...validCreate, certificateType: 'invalid' })).toThrow();
  });

  it('rejects invalid audience scope', () => {
    expect(() => createCertificateTemplateSchema.parse({ ...validCreate, audienceScope: 'invalid' })).toThrow();
  });

  it('trims whitespace from template name', () => {
    const result = createCertificateTemplateSchema.parse({ ...validCreate, templateName: '  Test  ' });
    expect(result.templateName).toBe('Test');
  });

  it('accepts optional fields', () => {
    const result = createCertificateTemplateSchema.parse({
      ...validCreate,
      pageSize: 'A4_portrait',
      orientation: 'portrait',
      allowedVariablesJson: ['full_name', 'event_name'],
      requiredVariablesJson: ['full_name'],
      defaultFileNamePattern: '{{full_name}}-cert.pdf',
      signatureConfigJson: { name: 'Dr. Smith', title: 'Dean' },
      brandingSnapshotJson: { logo: 'url', colors: { primary: '#000' } },
      qrVerificationEnabled: false,
      verificationText: 'Scan to verify',
      notes: 'For annual conference',
    });
    expect(result.pageSize).toBe('A4_portrait');
    expect(result.orientation).toBe('portrait');
    expect(result.allowedVariablesJson).toEqual(['full_name', 'event_name']);
    expect(result.qrVerificationEnabled).toBe(false);
  });
});

describe('updateCertificateTemplateSchema', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid partial update', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      templateName: 'Updated Name',
    });
    expect(result.templateId).toBe(validUuid);
    expect(result.templateName).toBe('Updated Name');
  });

  it('rejects invalid template ID', () => {
    expect(() => updateCertificateTemplateSchema.parse({ templateId: 'invalid' })).toThrow();
  });

  it('accepts templateJson update', () => {
    const result = updateCertificateTemplateSchema.parse({
      templateId: validUuid,
      templateJson: { schemas: [{ name: 'updated' }] },
    });
    expect(result.templateJson).toBeDefined();
  });
});

describe('activateCertificateTemplateSchema', () => {
  it('accepts valid UUID', () => {
    const result = activateCertificateTemplateSchema.parse({
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.templateId).toBeDefined();
  });

  it('rejects invalid UUID', () => {
    expect(() => activateCertificateTemplateSchema.parse({ templateId: 'not-uuid' })).toThrow();
  });
});

describe('archiveCertificateTemplateSchema', () => {
  it('accepts valid UUID', () => {
    const result = archiveCertificateTemplateSchema.parse({
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.templateId).toBeDefined();
  });
});

describe('issueCertificateSchema', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid issue input', () => {
    const result = issueCertificateSchema.parse({
      personId: validUuid,
      templateId: validUuid,
      certificateType: 'delegate_attendance',
      eligibilityBasisType: 'registration',
      renderedVariablesJson: { full_name: 'John Doe' },
    });
    expect(result.certificateType).toBe('delegate_attendance');
  });

  it('accepts optional eligibilityBasisId', () => {
    const result = issueCertificateSchema.parse({
      personId: validUuid,
      templateId: validUuid,
      certificateType: 'faculty_participation',
      eligibilityBasisType: 'manual',
      renderedVariablesJson: {},
    });
    expect(result.eligibilityBasisId).toBeUndefined();
  });
});

describe('revokeCertificateSchema', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid revocation', () => {
    const result = revokeCertificateSchema.parse({
      certificateId: validUuid,
      revokeReason: 'Issued in error',
    });
    expect(result.revokeReason).toBe('Issued in error');
  });

  it('rejects empty revoke reason', () => {
    expect(() => revokeCertificateSchema.parse({
      certificateId: validUuid,
      revokeReason: '',
    })).toThrow();
  });

  it('rejects whitespace-only revoke reason', () => {
    expect(() => revokeCertificateSchema.parse({
      certificateId: validUuid,
      revokeReason: '   ',
    })).toThrow();
  });
});

describe('bulkGenerateSchema', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid bulk request', () => {
    const result = bulkGenerateSchema.parse({
      templateId: validUuid,
      certificateType: 'delegate_attendance',
      personIds: [validUuid],
      eligibilityBasisType: 'registration',
    });
    expect(result.personIds).toHaveLength(1);
  });

  it('rejects empty personIds', () => {
    expect(() => bulkGenerateSchema.parse({
      templateId: validUuid,
      certificateType: 'delegate_attendance',
      personIds: [],
      eligibilityBasisType: 'registration',
    })).toThrow();
  });

  it('rejects more than 500 personIds', () => {
    const tooMany = Array.from({ length: 501 }, () => validUuid);
    expect(() => bulkGenerateSchema.parse({
      templateId: validUuid,
      certificateType: 'delegate_attendance',
      personIds: tooMany,
      eligibilityBasisType: 'registration',
    })).toThrow();
  });
});

describe('TEMPLATE_STATUS_TRANSITIONS', () => {
  it('draft can go to active or archived', () => {
    expect(TEMPLATE_STATUS_TRANSITIONS.draft).toEqual(['active', 'archived']);
  });

  it('active can only go to archived', () => {
    expect(TEMPLATE_STATUS_TRANSITIONS.active).toEqual(['archived']);
  });

  it('archived can revert to draft', () => {
    expect(TEMPLATE_STATUS_TRANSITIONS.archived).toEqual(['draft']);
  });
});
