import * as Sentry from '@sentry/nextjs';

export class EventIdMismatchError extends Error {
  constructor() {
    super('eventId mismatch');
    this.name = 'EventIdMismatchError';
  }
}

export function assertEventIdMatch(opts: {
  urlEventId: string;
  bodyEventId: string | undefined;
  userId: string;
  endpoint: string;
}): void {
  if (opts.bodyEventId === undefined || opts.bodyEventId === opts.urlEventId) {
    return;
  }

  const error = new EventIdMismatchError();

  Sentry.setUser({ id: opts.userId });
  Sentry.captureException(error, {
    tags: { module: 'tenancy', kind: 'eventId-mismatch' },
    extra: {
      urlEventId: opts.urlEventId,
      bodyEventId: opts.bodyEventId,
      endpoint: opts.endpoint,
    },
  });

  throw error;
}
