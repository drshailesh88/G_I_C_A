import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) },
}));

vi.mock('@/lib/actions/transport', () => ({
  generateTransportSuggestions: vi.fn(),
}));

vi.mock('@/lib/sentry', () => ({
  captureCascadeError: vi.fn(),
}));

import { generateTransportSuggestions } from '@/lib/actions/transport';
import { captureCascadeError } from '@/lib/sentry';
import {
  clearCascadeHandlers,
  disableTestMode,
  emitCascadeEvent,
  enableTestMode,
  getHandlerCount,
} from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerTransportCascadeHandlers } from './transport-cascade';

const EVENT_ID = 'event-transport-001';
const ACTOR = { type: 'system' as const, id: 'cascade' };

beforeEach(() => {
  vi.clearAllMocks();
  clearCascadeHandlers();
  enableTestMode();
});

afterAll(() => {
  disableTestMode();
  clearCascadeHandlers();
});

describe('registerTransportCascadeHandlers', () => {
  it('registers a handler for TRAVEL_SAVED', () => {
    registerTransportCascadeHandlers();
    expect(getHandlerCount(CASCADE_EVENTS.TRAVEL_SAVED)).toBe(1);
  });

  it('registers a handler for TRAVEL_CREATED', () => {
    registerTransportCascadeHandlers();
    expect(getHandlerCount(CASCADE_EVENTS.TRAVEL_CREATED)).toBe(1);
  });

  it('calls generateTransportSuggestions with the correct eventId for TRAVEL_SAVED', async () => {
    registerTransportCascadeHandlers();

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_SAVED, EVENT_ID, ACTOR, {});

    expect(vi.mocked(generateTransportSuggestions)).toHaveBeenCalledWith(EVENT_ID);
  });

  it('calls generateTransportSuggestions with the correct eventId for TRAVEL_CREATED', async () => {
    registerTransportCascadeHandlers();

    await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_CREATED, EVENT_ID, ACTOR, {});

    expect(vi.mocked(generateTransportSuggestions)).toHaveBeenCalledWith(EVENT_ID);
  });

  it('swallows handler errors and reports them through captureCascadeError', async () => {
    vi.mocked(generateTransportSuggestions).mockRejectedValueOnce(new Error('boom'));
    registerTransportCascadeHandlers();

    const result = await emitCascadeEvent(CASCADE_EVENTS.TRAVEL_SAVED, EVENT_ID, ACTOR, {});

    expect(result.errors).toEqual([]);
    expect(vi.mocked(captureCascadeError)).toHaveBeenCalled();
  });
});
