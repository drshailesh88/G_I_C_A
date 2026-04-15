import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../_guard', () => ({ guard: () => null }));

const mockGetInngestAttemptCount = vi.fn();
vi.mock('@/lib/inngest/captured-events', () => ({
  getInngestAttemptCount: (...args: unknown[]) => mockGetInngestAttemptCount(...args),
}));

import { GET } from './route';

describe('GET /api/test/inngest-attempts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns count for given eventId', async () => {
    mockGetInngestAttemptCount.mockResolvedValue({ count: 3, lastStatus: 'completed' });

    const req = new NextRequest('http://localhost/api/test/inngest-attempts?eventId=evt-123');
    const res = await GET(req);
    const body = await res.json();

    expect(body).toEqual({ eventId: 'evt-123', count: 3, lastStatus: 'completed' });
  });

  it('returns 400 if eventId missing', async () => {
    const req = new NextRequest('http://localhost/api/test/inngest-attempts');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns count=0 when no attempts recorded', async () => {
    mockGetInngestAttemptCount.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/test/inngest-attempts?eventId=evt-new');
    const res = await GET(req);
    const body = await res.json();

    expect(body).toEqual({ eventId: 'evt-new', count: 0, lastStatus: null });
  });
});
