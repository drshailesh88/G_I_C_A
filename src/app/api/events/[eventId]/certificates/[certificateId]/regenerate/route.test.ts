import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockAssertEventAccess, mockIssueCertificate, mockRevalidatePath } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockIssueCertificate: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/actions/certificate-issuance', () => ({ issueCertificate: mockIssueCertificate }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((_col: unknown, _eid: unknown, cond: unknown) => cond),
}));

import { POST } from './route';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CERT_ID = '660e8400-e29b-41d4-a716-446655440001';
const NEW_CERT_ID = '770e8400-e29b-41d4-a716-446655440002';
const TEMPLATE_ID = '880e8400-e29b-41d4-a716-446655440003';

function makeParams(eventId: string, certificateId: string) {
  return { params: Promise.resolve({ eventId, certificateId }) };
}

function makeRequest() {
  return new Request('http://localhost:4000/api/events/x/certificates/y/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

let selectCallIndex = 0;
function chainedSelectSequence(calls: unknown[][]) {
  selectCallIndex = 0;
  mockDb.select.mockImplementation(() => {
    const rows = calls[selectCallIndex] ?? [];
    selectCallIndex++;
    const chain: Record<string, unknown> = {
      from: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

const OLD_CERT = {
  id: CERT_ID,
  eventId: EVENT_ID,
  personId: 'person-1',
  certificateType: 'delegate_attendance',
  status: 'issued',
  eligibilityBasisType: 'attendance',
  eligibilityBasisId: null,
  renderedVariablesJson: { full_name: 'Priya' },
  templateId: TEMPLATE_ID,
};

describe('POST /api/events/[eventId]/certificates/[certificateId]/regenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  });

  it('returns 201 with supersedes_id on successful regenerate', async () => {
    chainedSelectSequence([
      [OLD_CERT],
      [{ id: TEMPLATE_ID }],
    ]);
    mockIssueCertificate.mockResolvedValue({
      id: NEW_CERT_ID,
      certificateNumber: 'GEM2026-ATT-00002',
      verificationToken: 'token-uuid',
      supersedesId: CERT_ID,
    });

    const res = await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(NEW_CERT_ID);
    expect(body.certificate_number).toBe('GEM2026-ATT-00002');
    expect(body.supersedes_id).toBe(CERT_ID);
  });

  it('passes old cert data to issueCertificate', async () => {
    chainedSelectSequence([
      [OLD_CERT],
      [{ id: TEMPLATE_ID }],
    ]);
    mockIssueCertificate.mockResolvedValue({
      id: NEW_CERT_ID,
      certificateNumber: 'GEM2026-ATT-00002',
      verificationToken: 'token-uuid',
    });

    await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));

    expect(mockIssueCertificate).toHaveBeenCalledWith(EVENT_ID, {
      personId: 'person-1',
      certificateType: 'delegate_attendance',
      templateId: TEMPLATE_ID,
      eligibilityBasisType: 'attendance',
      eligibilityBasisId: undefined,
      renderedVariablesJson: { full_name: 'Priya' },
    });
  });

  it('returns 404 when certificate not found', async () => {
    chainedSelectSequence([[]]);

    const res = await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(404);
  });

  it('returns 400 when certificate is already superseded', async () => {
    chainedSelectSequence([[{ ...OLD_CERT, status: 'superseded' }]]);

    const res = await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('superseded');
  });

  it('returns 400 when certificate is revoked', async () => {
    chainedSelectSequence([[{ ...OLD_CERT, status: 'revoked' }]]);

    const res = await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(400);
  });

  it('returns 400 when no active template exists', async () => {
    chainedSelectSequence([
      [OLD_CERT],
      [],
    ]);

    const res = await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('template');
  });

  it('returns 403 for ops role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });

    const res = await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(403);
  });

  it('returns 403 for read_only role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:read_only' });

    const res = await POST(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
  });

  it('returns 400 for invalid eventId', async () => {
    const res = await POST(makeRequest(), makeParams('not-a-uuid', CERT_ID));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid certificateId', async () => {
    const res = await POST(makeRequest(), makeParams(EVENT_ID, 'not-a-uuid'));
    expect(res.status).toBe(400);
  });
});
