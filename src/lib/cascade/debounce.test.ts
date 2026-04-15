import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io');
vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fake-token');

const mockEmitCascadeEvent = vi.fn().mockResolvedValue({ handlersRun: 1, errors: [] });

vi.mock('./emit', () => ({
  emitCascadeEvent: (...args: unknown[]) => mockEmitCascadeEvent(...args),
}));

const redisStore = new Map<string, string>();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: vi.fn(async (key: string) => {
      const val = redisStore.get(key);
      return val !== undefined ? val : null;
    }),
    set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && redisStore.has(key)) return null;
      redisStore.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return 'OK';
    }),
  })),
}));

import { debouncedEmitCascadeEvent } from './debounce';
import { CASCADE_EVENTS } from './events';

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
});

describe('debouncedEmitCascadeEvent', () => {
  const actor = { type: 'user' as const, id: 'user_1' };
  const eventId = 'evt-1';
  const sourceEntityType = 'travel';
  const sourceEntityId = 'tr-1';

  it('second emit within 5s is swallowed', async () => {
    await debouncedEmitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      eventId,
      actor,
      { changeSummary: { arrivalDate: '2026-05-01' } },
      sourceEntityType,
      sourceEntityId,
    );

    await debouncedEmitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      eventId,
      actor,
      { changeSummary: { departureDate: '2026-05-05' } },
      sourceEntityType,
      sourceEntityId,
    );

    expect(mockEmitCascadeEvent).toHaveBeenCalledTimes(1);
  });

  it('merged changeSummary', async () => {
    await debouncedEmitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      eventId,
      actor,
      { changeSummary: { arrivalDate: '2026-05-01' } },
      sourceEntityType,
      sourceEntityId,
    );

    await debouncedEmitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      eventId,
      actor,
      { changeSummary: { departureDate: '2026-05-05' } },
      sourceEntityType,
      sourceEntityId,
    );

    const bufferKey = `cascade:debounce:buffer:${eventId}:${sourceEntityType}:${sourceEntityId}`;
    const bufferRaw = redisStore.get(bufferKey);
    expect(bufferRaw).toBeDefined();
    const merged = JSON.parse(bufferRaw!);
    expect(merged).toHaveProperty('arrivalDate');
    expect(merged).toHaveProperty('departureDate');
  });

  it('CE14 — different travelIds not coalesced', async () => {
    await debouncedEmitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      eventId,
      actor,
      { changeSummary: { arrivalDate: '2026-05-01' } },
      'travel',
      'tr-1',
    );

    await debouncedEmitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      eventId,
      actor,
      { changeSummary: { arrivalDate: '2026-06-01' } },
      'travel',
      'tr-2',
    );

    expect(mockEmitCascadeEvent).toHaveBeenCalledTimes(2);
  });
});
