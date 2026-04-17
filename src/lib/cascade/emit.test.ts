// Mock Inngest client (not used in test mode, but imported by emit.ts)
const mockSend = vi.fn().mockResolvedValue({ ids: ['test-id'] });
const mockCaptureInngestEvent = vi.fn().mockResolvedValue(undefined);
const mockAttachVariablesSnapshotIfNeeded = vi.fn(async (_eventName: unknown, payload: unknown) => payload);
const mockCaptureCascadeError = vi.fn();

vi.mock('../inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockSend(...args) },
}));
vi.mock('../inngest/captured-events', () => ({
  captureInngestEvent: (...args: unknown[]) => mockCaptureInngestEvent(...args),
}));
vi.mock('./variables-snapshot', () => ({
  attachVariablesSnapshotIfNeeded: (...args: unknown[]) => mockAttachVariablesSnapshotIfNeeded(...args),
}));
vi.mock('../sentry', () => ({
  captureCascadeError: (...args: unknown[]) => mockCaptureCascadeError(...args),
}));

import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import {
  onCascadeEvent,
  emitCascadeEvent,
  clearCascadeHandlers,
  getHandlerCount,
  enableTestMode,
  disableTestMode,
} from './emit';
import { CASCADE_EVENTS } from './events';

// Use in-memory mode for these unit tests
enableTestMode();

beforeEach(() => {
  clearCascadeHandlers();
  mockSend.mockReset();
  mockSend.mockResolvedValue({ ids: ['test-id'] });
  mockCaptureInngestEvent.mockReset();
  mockCaptureInngestEvent.mockResolvedValue(undefined);
  mockAttachVariablesSnapshotIfNeeded.mockReset();
  mockAttachVariablesSnapshotIfNeeded.mockImplementation(async (_eventName: unknown, payload: unknown) => payload);
  mockCaptureCascadeError.mockReset();
  enableTestMode();
});

afterAll(() => {
  disableTestMode();
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

  it('blocks malformed production payloads before they reach Inngest', async () => {
    disableTestMode();

    const result = await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      'event-1',
      { type: 'user', id: 'user_123' },
      { travelRecordId: 'tr-1', changeSummary: { city: { from: 'A', to: 'B' } } },
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockCaptureInngestEvent).not.toHaveBeenCalled();
    expect(result.handlersRun).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/validation failed/i);
    expect(mockCaptureCascadeError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        handler: 'inngest-emit',
        eventId: 'event-1',
        cascadeEvent: CASCADE_EVENTS.TRAVEL_UPDATED,
      }),
    );
  });

  it('rejects registration payloads whose nested eventId does not match the envelope', async () => {
    disableTestMode();

    const result = await emitCascadeEvent(
      CASCADE_EVENTS.REGISTRATION_CREATED,
      'event-1',
      { type: 'system', id: 'system:cascade' },
      {
        registrationId: 'reg-1',
        personId: 'person-1',
        eventId: 'event-2',
      },
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.handlersRun).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/must match the envelope eventId/i);
  });

  it('falls back to the original payload when variable snapshot enrichment fails', async () => {
    disableTestMode();
    mockAttachVariablesSnapshotIfNeeded.mockRejectedValueOnce(new Error('snapshot offline'));

    const payload = {
      travelRecordId: 'tr-1',
      personId: 'person-1',
      changeSummary: { city: { from: 'A', to: 'B' } },
    };

    const result = await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      'event-1',
      { type: 'user', id: 'user_123' },
      payload,
    );

    expect(result).toEqual({ handlersRun: 1, errors: [] });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: CASCADE_EVENTS.TRAVEL_UPDATED,
        data: {
          eventId: 'event-1',
          actor: { type: 'user', id: 'user_123' },
          payload,
        },
      }),
    );
    expect(mockCaptureCascadeError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        handler: 'cascade-emit-variables-snapshot',
        eventId: 'event-1',
        cascadeEvent: CASCADE_EVENTS.TRAVEL_UPDATED,
      }),
    );
  });
});
