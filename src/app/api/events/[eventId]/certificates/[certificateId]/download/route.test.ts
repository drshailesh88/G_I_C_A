import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockAssertEventAccess, mockRevalidatePath, mockGetSignedUrl } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((_col: unknown, _eid: unknown, cond: unknown) => cond),
}));
vi.mock('@/lib/certificates/storage', () => ({
  createR2Provider: () => ({
    getSignedUrl: mockGetSignedUrl,
  }),
}));

import { GET } from './route';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CERT_ID = '660e8400-e29b-41d4-a716-446655440001';

function makeParams(eventId: string, certificateId: string) {
  return { params: Promise.resolve({ eventId, certificateId }) };
}

function makeRequest() {
  return new Request(`http://localhost:4000/api/events/${EVENT_ID}/certificates/${CERT_ID}/download`);
}

const ISSUED_CERT = {
  id: CERT_ID,
  eventId: EVENT_ID,
  status: 'issued',
  storageKey: `certificates/${EVENT_ID}/attendance/${CERT_ID}.pdf`,
};

const SUPERSEDED_CERT = {
  ...ISSUED_CERT,
  status: 'superseded',
};

const REVOKED_CERT = {
  ...ISSUED_CERT,
  status: 'revoked',
};

function mockSelectReturns(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  (chain.from as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
  (chain.where as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
  mockDb.select.mockReturnValue(chain);
}

describe('GET /api/events/[eventId]/certificates/[certificateId]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url?token=abc');
  });

  it('non-super-admin gets 404 for revoked cert', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });
    mockSelectReturns([REVOKED_CERT]);

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(404);
  });

  it('super-admin gets signed URL for revoked cert', async () => {
    mockSelectReturns([REVOKED_CERT]);

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\//);
  });

  it('issued cert downloadable by coordinator', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });
    mockSelectReturns([ISSUED_CERT]);

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\//);
  });

  it('superseded cert downloadable by certificate write role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });
    mockSelectReturns([SUPERSEDED_CERT]);

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\//);
  });

  it('returns 404 when certificate not found', async () => {
    mockSelectReturns([]);

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(404);
  });

  it('returns 404 for cross-event access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('You do not have access'));

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid params', async () => {
    const res = await GET(makeRequest(), makeParams('not-a-uuid', CERT_ID));
    expect(res.status).toBe(400);
  });

  it('calls getSignedUrl with storageKey and 5 minute TTL', async () => {
    mockSelectReturns([ISSUED_CERT]);

    await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(mockGetSignedUrl).toHaveBeenCalledWith(ISSUED_CERT.storageKey, 300);
  });

  it('read-only role gets 403 before certificate lookup', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:read_only' });
    mockSelectReturns([REVOKED_CERT]);

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('ops role gets 403 before certificate lookup', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
    mockSelectReturns([REVOKED_CERT]);

    const res = await GET(makeRequest(), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
