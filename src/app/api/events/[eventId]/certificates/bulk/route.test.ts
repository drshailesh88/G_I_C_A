import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockTtl = vi.fn();
const mockDel = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
    ttl: mockTtl,
    del: mockDel,
  })),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn().mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' }),
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { POST } from './route';

const EVENT_ID = '00000000-0000-0000-0000-000000000001';

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/events/${EVENT_ID}/certificates/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(eventId = EVENT_ID) {
  return { params: Promise.resolve({ eventId }) };
}

describe('POST /api/events/[eventId]/certificates/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue('OK');
  });

  // ── Spec unit tests ───────────────────────────────────────────

  it('lock acquired with NX + TTL', async () => {
    const body = { certificate_type: 'delegate_attendance', scope: 'all' };
    const res = await POST(makeRequest(body), makeParams());

    expect(res.status).toBe(202);
    expect(mockSet).toHaveBeenCalledWith(
      `lock:certificates:generate:${EVENT_ID}:delegate_attendance`,
      expect.any(String),
      { nx: true, ex: 300 },
    );
    const storedValue = JSON.parse(mockSet.mock.calls[0][1] as string);
    expect(storedValue.lock_holder).toBe('user-1');
    expect(storedValue).toHaveProperty('started_at');
  });

  it('409 when lock held', async () => {
    mockSet.mockResolvedValue(null);
    mockGet.mockResolvedValue({ lock_holder: 'other-user', started_at: '2026-04-15T10:00:00Z' });
    mockTtl.mockResolvedValue(250);

    const body = { certificate_type: 'delegate_attendance', scope: 'all' };
    const res = await POST(makeRequest(body), makeParams());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('generation in progress');
    expect(json.lock_holder).toBe('other-user');
    expect(json.started_at).toBe('2026-04-15T10:00:00Z');
    expect(json).toHaveProperty('expires_at');
  });

  // ── Spec edge case ────────────────────────────────────────────

  it('lock released on handler exception', async () => {
    const { inngest } = await import('@/lib/inngest/client');
    vi.mocked(inngest.send).mockRejectedValueOnce(new Error('Inngest down'));

    const body = { certificate_type: 'delegate_attendance', scope: 'all' };
    const res = await POST(makeRequest(body), makeParams());

    expect(res.status).toBe(500);
    expect(mockDel).toHaveBeenCalledWith(
      `lock:certificates:generate:${EVENT_ID}:delegate_attendance`,
    );
  });

  // ── Additional coverage ───────────────────────────────────────

  it('rejects ops role with 403', async () => {
    const { assertEventAccess } = await import('@/lib/auth/event-access');
    vi.mocked(assertEventAccess).mockResolvedValueOnce({ userId: 'u', role: 'org:ops' } as never);

    const body = { certificate_type: 'delegate_attendance', scope: 'all' };
    const res = await POST(makeRequest(body), makeParams());
    expect(res.status).toBe(403);
  });

  it('rejects read_only role with 403', async () => {
    const { assertEventAccess } = await import('@/lib/auth/event-access');
    vi.mocked(assertEventAccess).mockResolvedValueOnce({ userId: 'u', role: 'org:read_only' } as never);

    const body = { certificate_type: 'delegate_attendance', scope: 'all' };
    const res = await POST(makeRequest(body), makeParams());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('forbidden');
  });

  it('rejects invalid event ID with 400', async () => {
    const body = { certificate_type: 'delegate_attendance', scope: 'all' };
    const res = await POST(makeRequest(body), makeParams('not-uuid'));
    expect(res.status).toBe(400);
  });

  it('returns 202 with batch_id, total, lock_expires_at for ids scope', async () => {
    const ids = [
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    ];
    const body = { certificate_type: 'delegate_attendance', scope: { ids } };
    const res = await POST(makeRequest(body), makeParams());
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json).toHaveProperty('batch_id');
    expect(json.total).toBe(2);
    expect(json).toHaveProperty('lock_expires_at');
  });

  it('rejects invalid body with 400', async () => {
    const body = { certificate_type: 'invalid_type', scope: 'all' };
    const res = await POST(makeRequest(body), makeParams());
    expect(res.status).toBe(400);
  });
});
