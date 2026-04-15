import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../_guard', () => ({ guard: () => null }));

const mockQueryCapturedEvents = vi.fn();
vi.mock('@/lib/inngest/captured-events', () => ({
  queryCapturedEvents: (...args: unknown[]) => mockQueryCapturedEvents(...args),
}));

import { GET } from './route';

describe('GET /api/test/inngest-events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns events filtered by name', async () => {
    const events = [{ id: 'e1', name: 'conference/travel.saved', data: {}, timestamp: '2026-04-15T00:00:00Z' }];
    mockQueryCapturedEvents.mockResolvedValue(events);

    const req = new NextRequest('http://localhost/api/test/inngest-events?name=conference/travel.saved');
    const res = await GET(req);
    const body = await res.json();

    expect(mockQueryCapturedEvents).toHaveBeenCalledWith({
      name: 'conference/travel.saved',
      triggerId: undefined,
      windowMs: undefined,
    });
    expect(body.events).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it('passes triggerId and window params', async () => {
    mockQueryCapturedEvents.mockResolvedValue([]);

    const req = new NextRequest('http://localhost/api/test/inngest-events?triggerId=t1&window=60000');
    const res = await GET(req);
    const body = await res.json();

    expect(mockQueryCapturedEvents).toHaveBeenCalledWith({
      name: undefined,
      triggerId: 't1',
      windowMs: 60000,
    });
    expect(body.count).toBe(0);
  });
});
