import { describe, it, expect } from 'vitest';
import { serializeVerifyResponse } from './certificate-verify-serializer';

describe('serializeVerifyResponse', () => {
  it('response shape whitelist enforced — only emits whitelisted keys', () => {
    const fullCertRow = {
      status: 'issued',
      certificate_number: 'GEM2026-ATT-00001',
      certificate_type: 'delegate_attendance',
      person_name: 'Dr. Test User',
      event_name: 'GEM India 2026',
      issued_at: new Date('2026-04-15T10:00:00Z'),
      // Forbidden fields that must NOT appear
      pdf_url: 'https://r2.example.com/certs/abc.pdf',
      storage_key: 'certs/abc.pdf',
      download_url: 'https://download.example.com/abc',
      email: 'test@example.com',
      phone: '+919876543210',
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      registration_id: '660e8400-e29b-41d4-a716-446655440000',
      postal_address: '123 Main St, Mumbai',
      id: '770e8400-e29b-41d4-a716-446655440000',
      template_id: '880e8400-e29b-41d4-a716-446655440000',
      event_id: '990e8400-e29b-41d4-a716-446655440000',
    };

    const result = serializeVerifyResponse(fullCertRow);

    const allowedKeys = new Set([
      'status',
      'certificate_number',
      'certificate_type',
      'person_name',
      'event_name',
      'issued_at',
      'revoked_at',
      'revoke_reason',
      'superseded_by_certificate_number',
    ]);

    for (const key of Object.keys(result)) {
      expect(allowedKeys.has(key)).toBe(true);
    }

    expect(result.status).toBe('issued');
    expect(result.certificate_number).toBe('GEM2026-ATT-00001');
    expect(result.certificate_type).toBe('delegate_attendance');
    expect(result.person_name).toBe('Dr. Test User');
    expect(result.event_name).toBe('GEM India 2026');
    expect(result.issued_at).toEqual(new Date('2026-04-15T10:00:00Z'));

    expect('pdf_url' in result).toBe(false);
    expect('storage_key' in result).toBe(false);
    expect('download_url' in result).toBe(false);
    expect('email' in result).toBe(false);
    expect('phone' in result).toBe(false);
    expect('person_id' in result).toBe(false);
    expect('registration_id' in result).toBe(false);
    expect('postal_address' in result).toBe(false);
  });

  it('includes revoked_at and revoke_reason when present', () => {
    const revokedRow = {
      status: 'revoked',
      certificate_number: 'GEM2026-ATT-00002',
      certificate_type: 'delegate_attendance',
      person_name: 'Revoked Person',
      event_name: 'GEM India 2026',
      issued_at: new Date('2026-04-10T10:00:00Z'),
      revoked_at: new Date('2026-04-12T10:00:00Z'),
      revoke_reason: 'Fraudulent claim',
      pdf_url: 'https://should-not-appear.com',
    };

    const result = serializeVerifyResponse(revokedRow);

    expect(result.status).toBe('revoked');
    expect(result.revoked_at).toEqual(new Date('2026-04-12T10:00:00Z'));
    expect(result.revoke_reason).toBe('Fraudulent claim');
    expect('pdf_url' in result).toBe(false);
  });

  it('includes superseded_by_certificate_number when present', () => {
    const supersededRow = {
      status: 'superseded',
      certificate_number: 'GEM2026-ATT-00003',
      certificate_type: 'delegate_attendance',
      person_name: 'Superseded Person',
      event_name: 'GEM India 2026',
      issued_at: new Date('2026-04-10T10:00:00Z'),
      superseded_by_certificate_number: 'GEM2026-ATT-00004',
    };

    const result = serializeVerifyResponse(supersededRow);

    expect(result.status).toBe('superseded');
    expect(result.superseded_by_certificate_number).toBe('GEM2026-ATT-00004');
  });

  it('omits optional fields when null/undefined', () => {
    const minimalRow = {
      status: 'issued',
      certificate_number: 'GEM2026-ATT-00005',
      certificate_type: 'delegate_attendance',
      person_name: 'Minimal Person',
      event_name: 'GEM India 2026',
      issued_at: new Date('2026-04-15T10:00:00Z'),
      revoked_at: null,
      revoke_reason: undefined,
      superseded_by_certificate_number: null,
    };

    const result = serializeVerifyResponse(minimalRow);

    expect(Object.keys(result)).toEqual([
      'status',
      'certificate_number',
      'certificate_type',
      'person_name',
      'event_name',
      'issued_at',
    ]);
  });
});
