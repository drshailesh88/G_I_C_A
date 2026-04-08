import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  onCascadeEvent,
  emitCascadeEvent,
  clearCascadeHandlers,
  getHandlerCount,
} from './emit';
import { CASCADE_EVENTS } from './events';

beforeEach(() => {
  clearCascadeHandlers();
});

describe('Cascade event emitter', () => {
  it('registers and calls handlers', async () => {
    const handler = vi.fn();
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, handler);

    expect(getHandlerCount(CASCADE_EVENTS.TRAVEL_UPDATED)).toBe(1);

    await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      'event-1',
      { type: 'user', id: 'user_123' },
      { travelRecordId: 'tr-1' },
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      eventId: 'event-1',
      actor: { type: 'user', id: 'user_123' },
      payload: { travelRecordId: 'tr-1' },
    });
  });

  it('fans out to multiple handlers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, handler1);
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, handler2);

    const result = await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      'event-1',
      { type: 'user', id: 'user_123' },
      {},
    );

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(result.handlersRun).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('continues execution when a handler throws', async () => {
    const failHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
    const successHandler = vi.fn();
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, failHandler);
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, successHandler);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_CANCELLED,
      'event-1',
      { type: 'system', id: 'system:test' },
      {},
    );
    consoleSpy.mockRestore();

    expect(successHandler).toHaveBeenCalledOnce();
    expect(result.handlersRun).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Handler failed');
  });

  it('returns 0 handlers when no handlers registered', async () => {
    const result = await emitCascadeEvent(
      CASCADE_EVENTS.ACCOMMODATION_SAVED,
      'event-1',
      { type: 'user', id: 'user_123' },
      {},
    );

    expect(result.handlersRun).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('clears all handlers', () => {
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, vi.fn());
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_CANCELLED, vi.fn());

    expect(getHandlerCount(CASCADE_EVENTS.TRAVEL_UPDATED)).toBe(1);
    clearCascadeHandlers();
    expect(getHandlerCount(CASCADE_EVENTS.TRAVEL_UPDATED)).toBe(0);
  });

  it('does not cross-fire between different event names', async () => {
    const travelHandler = vi.fn();
    const accomHandler = vi.fn();
    onCascadeEvent(CASCADE_EVENTS.TRAVEL_UPDATED, travelHandler);
    onCascadeEvent(CASCADE_EVENTS.ACCOMMODATION_UPDATED, accomHandler);

    await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      'event-1',
      { type: 'user', id: 'user_123' },
      {},
    );

    expect(travelHandler).toHaveBeenCalledOnce();
    expect(accomHandler).not.toHaveBeenCalled();
  });
});
