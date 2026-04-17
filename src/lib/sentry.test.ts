import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import {
  captureError,
  captureNotificationError,
  captureStorageError,
  captureCascadeError,
} from './sentry';

vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
  captureException: vi.fn(),
}));

const mockSetUser = vi.mocked(Sentry.setUser);
const mockCaptureException = vi.mocked(Sentry.captureException);

describe('captureError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureException with the error', () => {
    const err = new Error('boom');
    captureError(err);
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(err, expect.any(Object));
  });

  it('does not call setUser when userId is absent', () => {
    captureError(new Error());
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });

  it('does not call setUser when userId is null', () => {
    captureError(new Error(), { userId: null });
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });

  it('calls setUser with { id: userId } when userId is a non-empty string', () => {
    captureError(new Error(), { userId: 'user_abc123' });
    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user_abc123' });
  });

  it('clears a previous user context before capturing an anonymous error', () => {
    captureError(new Error('first'), { userId: 'user_abc123' });
    captureError(new Error('second'));

    expect(mockSetUser).toHaveBeenNthCalledWith(1, { id: 'user_abc123' });
    expect(mockSetUser).toHaveBeenNthCalledWith(2, null);
  });

  it('passes tags object with module when module is provided', () => {
    captureError(new Error(), { module: 'my-module' });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ module: 'my-module' }) }),
    );
  });

  it('omits module key from tags when module is not provided', () => {
    captureError(new Error());
    const secondArg = mockCaptureException.mock.calls[0][1] as Record<string, unknown>;
    expect((secondArg.tags as Record<string, unknown>)).not.toHaveProperty('module');
  });

  it('merges custom tags into captureException call', () => {
    captureError(new Error(), { tags: { env: 'prod', region: 'in' } });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({ env: 'prod', region: 'in' }),
      }),
    );
  });

  it('passes extra data through to captureException', () => {
    captureError(new Error(), { extra: { requestId: 'req-1', count: 42 } });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extra: { requestId: 'req-1', count: 42 } }),
    );
  });
});

describe('captureNotificationError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureException with module=notifications', () => {
    captureNotificationError(new Error(), { channel: 'email', eventId: 'evt-1' });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ module: 'notifications' }) }),
    );
  });

  it('includes channel in tags', () => {
    captureNotificationError(new Error(), { channel: 'whatsapp', eventId: 'evt-1' });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ channel: 'whatsapp' }) }),
    );
  });

  it('uses the provided provider value in notification_provider tag', () => {
    captureNotificationError(new Error(), {
      channel: 'email',
      eventId: 'evt-1',
      provider: 'resend',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({ notification_provider: 'resend' }),
      }),
    );
  });

  it('falls back to "unknown" when provider is not provided', () => {
    captureNotificationError(new Error(), { channel: 'email', eventId: 'evt-1' });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({ notification_provider: 'unknown' }),
      }),
    );
  });

  it('includes error_code tag when errorCode is provided', () => {
    captureNotificationError(new Error(), {
      channel: 'email',
      eventId: 'evt-1',
      errorCode: 'RATE_LIMIT',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({ error_code: 'RATE_LIMIT' }),
      }),
    );
  });

  it('omits error_code tag when errorCode is not provided', () => {
    captureNotificationError(new Error(), { channel: 'email', eventId: 'evt-1' });
    const secondArg = mockCaptureException.mock.calls[0][1] as Record<string, unknown>;
    expect((secondArg.tags as Record<string, unknown>)).not.toHaveProperty('error_code');
  });

  it('passes eventId, personId, and templateKey in extra', () => {
    captureNotificationError(new Error(), {
      channel: 'email',
      eventId: 'evt-42',
      personId: 'person-7',
      templateKey: 'welcome',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({
          eventId: 'evt-42',
          personId: 'person-7',
          templateKey: 'welcome',
        }),
      }),
    );
  });
});

describe('captureStorageError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureException with module=storage', () => {
    captureStorageError(new Error(), { operation: 'upload', storageKey: 'key-1' });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ module: 'storage' }) }),
    );
  });

  it('includes storage_operation tag matching the provided operation', () => {
    captureStorageError(new Error(), { operation: 'getSignedUrl', storageKey: 'key-1' });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({ storage_operation: 'getSignedUrl' }),
      }),
    );
  });

  it('includes storageKey in extra', () => {
    captureStorageError(new Error(), { operation: 'delete', storageKey: 'certs/abc.pdf' });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({ storageKey: 'certs/abc.pdf' }),
      }),
    );
  });

  it('passes the error object through to captureException', () => {
    const err = new Error('upload failed');
    captureStorageError(err, { operation: 'uploadStream', storageKey: 'k' });
    expect(mockCaptureException).toHaveBeenCalledWith(err, expect.any(Object));
  });
});

describe('captureCascadeError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureException with module=cascade', () => {
    captureCascadeError(new Error(), {
      handler: 'travel-cascade',
      eventId: 'evt-1',
      cascadeEvent: 'conference/travel.updated',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ module: 'cascade' }) }),
    );
  });

  it('includes cascade_handler and cascade_event in tags', () => {
    captureCascadeError(new Error(), {
      handler: 'travel-cascade',
      eventId: 'evt-1',
      cascadeEvent: 'conference/travel.updated',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({
          cascade_handler: 'travel-cascade',
          cascade_event: 'conference/travel.updated',
        }),
      }),
    );
  });

  it('includes eventId in extra', () => {
    captureCascadeError(new Error(), {
      handler: 'accommodation-cascade',
      eventId: 'evt-99',
      cascadeEvent: 'conference/accommodation.updated',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({ eventId: 'evt-99' }),
      }),
    );
  });

  it('passes the error object through to captureException', () => {
    const err = new Error('cascade failed');
    captureCascadeError(err, {
      handler: 'travel-cascade',
      eventId: 'evt-1',
      cascadeEvent: 'conference/travel.updated',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(err, expect.any(Object));
  });
});
