import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLookupAndVerify = vi.fn();

vi.mock('@/lib/actions/certificate-verify', () => ({
  lookupAndVerify: (...args: unknown[]) => mockLookupAndVerify(...args),
}));

import { GET } from './route';

function makeRequest(token: string) {
  const url = `http://localhost:4000/api/verify/${token}`;
  const request = new Request(url, { method: 'GET' });
  const params = Promise.resolve({ token });
  return { request, params };
}

const VALID_TOKEN = '550e8400-e29b-41d4-a716-446655440000';

describe('GET /api/verify/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for non-UUID token', async () => {
    const { request, params } = makeRequest('not-a-uuid');
    const res = await GET(request, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
    expect(mockLookupAndVerify).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown token', async () => {
    mockLookupAndVerify.mockResolvedValue(null);
    const { request, params } = makeRequest(VALID_TOKEN);
    const res = await GET(request, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 200 with whitelisted keys for issued cert', async () => {
    mockLookupAndVerify.mockResolvedValue({
      status: 'issued',
      certificate_number: 'GEM2026-ATT-00001',
      certificate_type: 'delegate_attendance',
      person_name: 'Dr. Test User',
      event_name: 'GEM India 2026',
      issued_at: '2026-04-15T10:00:00.000Z',
    });
    const { request, params } = makeRequest(VALID_TOKEN);
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      'certificate_number',
      'certificate_type',
      'event_name',
      'issued_at',
      'person_name',
      'status',
    ]);
    expect(body.status).toBe('issued');
  });

  it('returns revoked status with revoke_reason and revoked_at', async () => {
    mockLookupAndVerify.mockResolvedValue({
      status: 'revoked',
      certificate_number: 'GEM2026-ATT-00002',
      certificate_type: 'delegate_attendance',
      person_name: 'Revoked Person',
      event_name: 'GEM India 2026',
      issued_at: '2026-04-10T10:00:00.000Z',
      revoked_at: '2026-04-12T10:00:00.000Z',
      revoke_reason: 'Fraudulent claim',
    });
    const { request, params } = makeRequest(VALID_TOKEN);
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('revoked');
    expect(body.revoked_at).toBe('2026-04-12T10:00:00.000Z');
    expect(body.revoke_reason).toBe('Fraudulent claim');
    expect('pdf_url' in body).toBe(false);
  });

  it('returns superseded status with superseded_by_certificate_number', async () => {
    mockLookupAndVerify.mockResolvedValue({
      status: 'superseded',
      certificate_number: 'GEM2026-ATT-00003',
      certificate_type: 'delegate_attendance',
      person_name: 'Old Cert Person',
      event_name: 'GEM India 2026',
      issued_at: '2026-04-10T10:00:00.000Z',
      superseded_by_certificate_number: 'GEM2026-ATT-00004',
    });
    const { request, params } = makeRequest(VALID_TOKEN);
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('superseded');
    expect(body.superseded_by_certificate_number).toBe('GEM2026-ATT-00004');
  });

  it('returns 500 on internal error', async () => {
    mockLookupAndVerify.mockRejectedValue(new Error('DB down'));
    const { request, params } = makeRequest(VALID_TOKEN);
    const res = await GET(request, { params });
    expect(res.status).toBe(500);
  });
});
