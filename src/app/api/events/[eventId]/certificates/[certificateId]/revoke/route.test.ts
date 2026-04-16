import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockAssertEventAccess, mockRevalidatePath, EventNotFoundError } = vi.hoisted(() => {
  class EventNotFoundError extends Error {
    constructor() { super('Not found'); this.name = 'EventNotFoundError'; }
  }
  return {
    mockDb: { select: vi.fn(), update: vi.fn() },
    mockAssertEventAccess: vi.fn(),
    mockRevalidatePath: vi.fn(),
    EventNotFoundError,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess, EventNotFoundError }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((_col: unknown, _eid: unknown, cond: unknown) => cond),
}));

import { POST } from './route';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CERT_ID = '660e8400-e29b-41d4-a716-446655440001';

function makeParams(eventId: string, certificateId: string) {
  return { params: Promise.resolve({ eventId, certificateId }) };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost:4000/api/events/x/certificates/y/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ISSUED_CERT = {
  id: CERT_ID,
  eventId: EVENT_ID,
  status: 'issued',
  revokedAt: null,
  revokeReason: null,
};

function mockSelectReturns(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  // Make chain methods return chain
  (chain.from as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
  (chain.where as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
  mockDb.select.mockReturnValue(chain);
}

function mockUpdateReturns(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  (chain.set as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
  (chain.where as ReturnType<typeof vi.fn>).mockImplementation(() => chain);
  mockDb.update.mockReturnValue(chain);
}

describe('POST /api/events/[eventId]/certificates/[certificateId]/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  });

  it('revoke with reason sets row fields and returns 200', async () => {
    const now = new Date();
    mockSelectReturns([ISSUED_CERT]);
    mockUpdateReturns([{
      id: CERT_ID,
      status: 'revoked',
      revokedAt: now,
      revokeReason: 'duplicate attendance',
    }]);

    const res = await POST(makeRequest({ reason: 'duplicate attendance' }), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CERT_ID);
    expect(body.status).toBe('revoked');
    expect(body.revoked_at).toBeDefined();
  });

  it('rejects empty body (no reason field) with 400 reason_required', async () => {
    const res = await POST(makeRequest({}), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('reason_required');
  });

  it('rejects empty string reason with 400 reason_required', async () => {
    const res = await POST(makeRequest({ reason: '' }), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('reason_required');
  });

  it('rejects whitespace-only reason with 400 reason_required', async () => {
    const res = await POST(makeRequest({ reason: '   ' }), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('reason_required');
  });

  it('returns 400/409 when revoking already-revoked cert', async () => {
    mockSelectReturns([{ ...ISSUED_CERT, status: 'revoked', revokedAt: new Date('2026-01-01') }]);

    const res = await POST(makeRequest({ reason: 'test' }), makeParams(EVENT_ID, CERT_ID));
    expect([400, 409]).toContain(res.status);
  });

  it('returns 404 when certificate not found', async () => {
    mockSelectReturns([]);

    const res = await POST(makeRequest({ reason: 'test' }), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(404);
  });

  it('returns 403 for ops role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });

    const res = await POST(makeRequest({ reason: 'test' }), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 403 for read_only role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:read_only' });

    const res = await POST(makeRequest({ reason: 'test' }), makeParams(EVENT_ID, CERT_ID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid eventId', async () => {
    const res = await POST(makeRequest({ reason: 'test' }), makeParams('not-a-uuid', CERT_ID));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid certificateId', async () => {
    const res = await POST(makeRequest({ reason: 'test' }), makeParams(EVENT_ID, 'bad'));
    expect(res.status).toBe(400);
  });
});
