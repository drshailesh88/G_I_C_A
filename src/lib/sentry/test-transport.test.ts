import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCaptureSentryEvent = vi.fn().mockResolvedValue(undefined);

vi.mock('./captured-events', () => ({
  captureSentryEvent: (...args: unknown[]) => mockCaptureSentryEvent(...args),
}));

import { sentryBeforeSendHook, isTestMode } from './test-transport';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sentryBeforeSendHook', () => {
  it('captures event and returns it (pass-through)', () => {
    const event = {
      tags: { kind: 'eventId-mismatch', module: 'tenancy' },
      extra: { urlEventId: 'e1', bodyEventId: 'e2' },
      exception: { values: [{ type: 'EventIdMismatchError', value: 'eventId mismatch' }] },
    };

    const result = sentryBeforeSendHook(event);

    expect(result).toBe(event);
    expect(mockCaptureSentryEvent).toHaveBeenCalledWith({
      tags: { kind: 'eventId-mismatch', module: 'tenancy' },
      extra: { urlEventId: 'e1', bodyEventId: 'e2' },
      message: 'eventId mismatch',
    });
  });

  it('extracts message from exception type when value is absent', () => {
    const event = {
      tags: {},
      exception: { values: [{ type: 'SomeError' }] },
    };

    sentryBeforeSendHook(event);

    expect(mockCaptureSentryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'SomeError' }),
    );
  });
});

describe('isTestMode', () => {
  it('returns true in non-production', () => {
    expect(isTestMode()).toBe(true);
  });
});
