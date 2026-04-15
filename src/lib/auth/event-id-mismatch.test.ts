import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
  captureException: vi.fn(),
}));

import { assertEventIdMatch, EventIdMismatchError } from './event-id-mismatch';
import * as Sentry from '@sentry/nextjs';

describe('assertEventIdMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws EventIdMismatchError when URL and body eventId differ', () => {
    expect(() =>
      assertEventIdMatch({
        urlEventId: 'aaa',
        bodyEventId: 'bbb',
        userId: 'user-1',
        endpoint: '/api/events/aaa/sessions',
      }),
    ).toThrow(EventIdMismatchError);
  });

  it('returns mismatch signal with correct error message', () => {
    try {
      assertEventIdMatch({
        urlEventId: 'aaa',
        bodyEventId: 'bbb',
        userId: 'user-1',
        endpoint: '/api/events/aaa/sessions',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EventIdMismatchError);
      expect((err as Error).message).toBe('eventId mismatch');
    }
  });

  it('emits Sentry event with userId, urlEventId, bodyEventId, endpoint', () => {
    try {
      assertEventIdMatch({
        urlEventId: 'A',
        bodyEventId: 'B',
        userId: 'user-42',
        endpoint: '/api/events/A/sessions',
      });
    } catch {
      // expected
    }

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user-42' });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(EventIdMismatchError),
      expect.objectContaining({
        tags: { module: 'tenancy', kind: 'eventId-mismatch' },
        extra: {
          urlEventId: 'A',
          bodyEventId: 'B',
          endpoint: '/api/events/A/sessions',
        },
      }),
    );
  });

  it('does not throw when body has no eventId (undefined)', () => {
    expect(() =>
      assertEventIdMatch({
        urlEventId: 'aaa',
        bodyEventId: undefined,
        userId: 'user-1',
        endpoint: '/api/events/aaa/sessions',
      }),
    ).not.toThrow();
  });

  it('does not throw when URL and body eventId match', () => {
    expect(() =>
      assertEventIdMatch({
        urlEventId: 'same-id',
        bodyEventId: 'same-id',
        userId: 'user-1',
        endpoint: '/api/events/same-id/sessions',
      }),
    ).not.toThrow();
  });

  it('does not call Sentry when no mismatch', () => {
    assertEventIdMatch({
      urlEventId: 'same',
      bodyEventId: undefined,
      userId: 'user-1',
      endpoint: '/api/events/same/sessions',
    });

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
