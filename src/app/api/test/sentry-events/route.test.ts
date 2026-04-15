import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuerySentryEvents = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/sentry/captured-events', () => ({
  querySentryEvents: (...args: unknown[]) => mockQuerySentryEvents(...args),
}));

vi.mock('../_guard', () => ({
  guard: () => null,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/test/sentry-events', () => {
  it('returns events matching kind filter', async () => {
    const events = [
      { id: '1', kind: 'eventId-mismatch', tags: {}, extra: {}, timestamp: '2026-01-01T00:00:00Z' },
    ];
    mockQuerySentryEvents.mockResolvedValueOnce(events);

    const req = new NextRequest('http://localhost:4000/api/test/sentry-events?kind=eventId-mismatch');
    const res = await GET(req);
    const body = await res.json();

    expect(body.events).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(mockQuerySentryEvents).toHaveBeenCalledWith({
      kind: 'eventId-mismatch',
      triggerId: undefined,
      endpoint: undefined,
      inngestEventId: undefined,
    });
  });

  it('passes all query params to querySentryEvents', async () => {
    mockQuerySentryEvents.mockResolvedValueOnce([]);

    const req = new NextRequest(
      'http://localhost:4000/api/test/sentry-events?kind=test&triggerId=t1&endpoint=/api/x&inngestEventId=ie1',
    );
    await GET(req);

    expect(mockQuerySentryEvents).toHaveBeenCalledWith({
      kind: 'test',
      triggerId: 't1',
      endpoint: '/api/x',
      inngestEventId: 'ie1',
    });
  });

  it('returns empty array when no events match', async () => {
    mockQuerySentryEvents.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost:4000/api/test/sentry-events');
    const res = await GET(req);
    const body = await res.json();

    expect(body.events).toEqual([]);
    expect(body.count).toBe(0);
  });
});
