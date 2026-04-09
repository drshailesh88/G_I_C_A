/**
 * Sentry Helpers — Server-Side Error Capture
 *
 * Wraps Sentry.captureException with:
 *   - Clerk user context (userId only — no PII)
 *   - Structured tags and extra data
 *   - Safe no-op when Sentry is not configured
 */

import * as Sentry from '@sentry/nextjs';

type CaptureErrorOptions = {
  /** Clerk userId — no email/name/phone to avoid PII in Sentry */
  userId?: string | null;
  /** Module or subsystem where the error occurred */
  module?: string;
  /** Additional tags for filtering in Sentry dashboard */
  tags?: Record<string, string>;
  /** Extra context data (must not contain PII) */
  extra?: Record<string, unknown>;
};

/**
 * Capture an error to Sentry with structured context.
 * Safe to call even when Sentry is not configured (no-op).
 */
export function captureError(error: unknown, options: CaptureErrorOptions = {}): void {
  const { userId, module, tags, extra } = options;

  // Set Clerk user context (ID only — no PII)
  if (userId) {
    Sentry.setUser({ id: userId });
  }

  Sentry.captureException(error, {
    tags: {
      ...(module ? { module } : {}),
      ...tags,
    },
    extra,
  });
}

/**
 * Capture a notification failure with structured context.
 * Used in notification service and cascade handlers.
 */
export function captureNotificationError(
  error: unknown,
  context: {
    channel: string;
    eventId: string;
    personId?: string;
    templateKey?: string;
    provider?: string;
    errorCode?: string;
  },
): void {
  captureError(error, {
    module: 'notifications',
    tags: {
      channel: context.channel,
      notification_provider: context.provider ?? 'unknown',
      ...(context.errorCode ? { error_code: context.errorCode } : {}),
    },
    extra: {
      eventId: context.eventId,
      personId: context.personId,
      templateKey: context.templateKey,
    },
  });
}

/**
 * Capture an R2 storage failure.
 */
export function captureStorageError(
  error: unknown,
  context: {
    operation: 'upload' | 'uploadStream' | 'getSignedUrl' | 'delete';
    storageKey: string;
  },
): void {
  captureError(error, {
    module: 'storage',
    tags: {
      storage_operation: context.operation,
    },
    extra: {
      storageKey: context.storageKey,
    },
  });
}

/**
 * Capture a cascade handler error.
 */
export function captureCascadeError(
  error: unknown,
  context: {
    handler: string;
    eventId: string;
    cascadeEvent: string;
  },
): void {
  captureError(error, {
    module: 'cascade',
    tags: {
      cascade_handler: context.handler,
      cascade_event: context.cascadeEvent,
    },
    extra: {
      eventId: context.eventId,
    },
  });
}
