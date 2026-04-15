import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn(),
}));
vi.mock('@/lib/actions/certificate-issuance', () => ({
  issueCertificate: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { issueCertificateRequestSchema } from './route';

describe('POST /api/events/[eventId]/certificates — Zod schema', () => {
  it('rejects missing required fields', () => {
    const result = issueCertificateRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldNames = result.error.issues.map((i) => i.path[0]);
      expect(fieldNames).toContain('person_id');
      expect(fieldNames).toContain('certificate_type');
      expect(fieldNames).toContain('template_id');
    }
  });

  it('accepts valid body and transforms to camelCase', () => {
    const result = issueCertificateRequestSchema.safeParse({
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      certificate_type: 'delegate_attendance',
      template_id: '660e8400-e29b-41d4-a716-446655440001',
      eligibility_basis_type: 'registration',
      eligibility_basis_id: '770e8400-e29b-41d4-a716-446655440002',
      variables: { full_name: 'Jane Doe' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        personId: '550e8400-e29b-41d4-a716-446655440000',
        certificateType: 'delegate_attendance',
        templateId: '660e8400-e29b-41d4-a716-446655440001',
        eligibilityBasisType: 'registration',
        eligibilityBasisId: '770e8400-e29b-41d4-a716-446655440002',
        renderedVariablesJson: { full_name: 'Jane Doe' },
      });
    }
  });

  it('rejects invalid certificate_type', () => {
    const result = issueCertificateRequestSchema.safeParse({
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      certificate_type: 'invalid_type',
      template_id: '660e8400-e29b-41d4-a716-446655440001',
      eligibility_basis_type: 'registration',
      variables: {},
    });
    expect(result.success).toBe(false);
  });

  it('allows eligibility_basis_id to be null', () => {
    const result = issueCertificateRequestSchema.safeParse({
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      certificate_type: 'faculty_participation',
      template_id: '660e8400-e29b-41d4-a716-446655440001',
      eligibility_basis_type: 'manual',
      eligibility_basis_id: null,
      variables: {},
    });
    expect(result.success).toBe(true);
  });
});
