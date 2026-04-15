import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn().mockResolvedValue('OK');
const mockKeys = vi.fn().mockResolvedValue([]);
const mockGet = vi.fn().mockResolvedValue(null);

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    keys: mockKeys,
    get: mockGet,
  })),
}));

import { captureSentryEvent, querySentryEvents } from './captured-events';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

describe('captureSentryEvent', () => {
  it('stores event in Redis with TTL', async () => {
    await captureSentryEvent({
      tags: { kind: 'eventId-mismatch', module: 'tenancy' },
      extra: { urlEventId: 'e1', bodyEventId: 'e2' },
      message: 'eventId mismatch',
    });

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, value, opts] = mockSet.mock.calls[0];
    expect(key).toMatch(/^test:sentry:events:sentry-/);
    expect(value.kind).toBe('eventId-mismatch');
    expect(value.tags.module).toBe('tenancy');
    expect(value.extra.urlEventId).toBe('e1');
    expect(value.message).toBe('eventId mismatch');
    expect(opts).toEqual({ ex: 3600 });
  });
});

describe('querySentryEvents', () => {
  it('returns empty array when no keys', async () => {
    mockKeys.mockResolvedValueOnce([]);
    const result = await querySentryEvents({});
    expect(result).toEqual([]);
  });

  it('filters by kind', async () => {
    const ev1 = { id: '1', kind: 'eventId-mismatch', tags: { kind: 'eventId-mismatch' }, extra: {}, timestamp: '2026-01-01T00:00:00Z' };
    const ev2 = { id: '2', kind: 'cascade-dispatch-failure', tags: { kind: 'cascade-dispatch-failure' }, extra: {}, timestamp: '2026-01-01T00:00:01Z' };

    mockKeys.mockResolvedValueOnce(['test:sentry:events:1', 'test:sentry:events:2']);
    mockGet.mockResolvedValueOnce(ev1).mockResolvedValueOnce(ev2);

    const result = await querySentryEvents({ kind: 'eventId-mismatch' });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('eventId-mismatch');
  });

  it('filters by endpoint', async () => {
    const ev1 = { id: '1', kind: 'eventId-mismatch', tags: {}, extra: { endpoint: '/api/events/e1/certs' }, timestamp: '2026-01-01T00:00:00Z' };

    mockKeys.mockResolvedValueOnce(['test:sentry:events:1']);
    mockGet.mockResolvedValueOnce(ev1);

    const result = await querySentryEvents({ endpoint: '/api/events/e1/certs' });
    expect(result).toHaveLength(1);
  });

  it('filters by triggerId in extra', async () => {
    const ev1 = { id: '1', kind: 'test', tags: {}, extra: { triggerId: 'trig-1' }, timestamp: '2026-01-01T00:00:00Z' };

    mockKeys.mockResolvedValueOnce(['test:sentry:events:1']);
    mockGet.mockResolvedValueOnce(ev1);

    const result = await querySentryEvents({ triggerId: 'trig-1' });
    expect(result).toHaveLength(1);
  });

  it('filters by inngestEventId', async () => {
    const ev1 = { id: '1', kind: 'cascade-payload-invalid', tags: { cascade_event: 'ievt-1' }, extra: {}, timestamp: '2026-01-01T00:00:00Z' };

    mockKeys.mockResolvedValueOnce(['test:sentry:events:1']);
    mockGet.mockResolvedValueOnce(ev1);

    const result = await querySentryEvents({ inngestEventId: 'ievt-1' });
    expect(result).toHaveLength(1);
  });
});
