import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockKeys = vi.fn();
const mockIncr = vi.fn();
const mockExpire = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
    keys: mockKeys,
    incr: mockIncr,
    expire: mockExpire,
  })),
}));

import {
  captureInngestEvent,
  getCapturedEvent,
  queryCapturedEvents,
  recordInngestAttempt,
  getInngestAttemptCount,
} from './captured-events';

describe('captured-events store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  });

  it('store records emit', async () => {
    const eventData = {
      id: 'evt-123',
      name: 'conference/travel.saved',
      data: { eventId: 'e1', actor: { type: 'system', id: 'sys' }, payload: { travelId: 't1' } },
    };

    await captureInngestEvent(eventData);

    expect(mockSet).toHaveBeenCalledWith(
      'test:inngest:events:evt-123',
      expect.objectContaining({
        id: 'evt-123',
        name: 'conference/travel.saved',
        data: eventData.data,
      }),
      { ex: 3600 },
    );
  });

  it('getCapturedEvent retrieves stored event', async () => {
    const stored = {
      id: 'evt-456',
      name: 'conference/travel.updated',
      data: { eventId: 'e2' },
      timestamp: '2026-04-15T00:00:00.000Z',
    };
    mockGet.mockResolvedValue(stored);

    const result = await getCapturedEvent('evt-456');
    expect(mockGet).toHaveBeenCalledWith('test:inngest:events:evt-456');
    expect(result).toEqual(stored);
  });

  it('queryCapturedEvents filters by name', async () => {
    mockKeys.mockResolvedValue(['test:inngest:events:evt-1', 'test:inngest:events:evt-2']);
    mockGet
      .mockResolvedValueOnce({ id: 'evt-1', name: 'conference/travel.saved', data: {}, timestamp: '2026-04-15T00:00:00.000Z' })
      .mockResolvedValueOnce({ id: 'evt-2', name: 'conference/session.updated', data: {}, timestamp: '2026-04-15T00:01:00.000Z' });

    const results = await queryCapturedEvents({ name: 'conference/travel.saved' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('conference/travel.saved');
  });

  it('recordInngestAttempt increments attempt count', async () => {
    mockIncr.mockResolvedValue(1);
    await recordInngestAttempt('evt-789', 'completed');

    expect(mockSet).toHaveBeenCalledWith(
      'test:inngest:attempts:evt-789',
      expect.objectContaining({ count: 1, lastStatus: 'completed' }),
      { ex: 3600 },
    );
  });

  it('getInngestAttemptCount returns stored count', async () => {
    mockGet.mockResolvedValue({ count: 3, lastStatus: 'completed' });
    const result = await getInngestAttemptCount('evt-789');
    expect(result).toEqual({ count: 3, lastStatus: 'completed' });
  });

  it('store does not grow unbounded — TTL set to 1h', async () => {
    await captureInngestEvent({
      id: 'evt-ttl',
      name: 'conference/travel.saved',
      data: {},
    });

    const setCall = mockSet.mock.calls[0];
    expect(setCall[2]).toEqual({ ex: 3600 });
  });
});
