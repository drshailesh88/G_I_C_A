import { captureSentryEvent } from './captured-events';

export function sentryBeforeSendHook(event: {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  exception?: { values?: Array<{ type?: string; value?: string }> };
}): typeof event {
  const message =
    event.exception?.values?.[0]?.value ?? event.exception?.values?.[0]?.type ?? undefined;

  captureSentryEvent({
    tags: (event.tags as Record<string, string>) ?? {},
    extra: (event.extra as Record<string, unknown>) ?? {},
    message,
  }).catch(() => {});

  return event;
}

export function isTestMode(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || process.env.E2E_TEST_MODE === '1'
  );
}
