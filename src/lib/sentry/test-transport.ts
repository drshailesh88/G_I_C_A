import type { ErrorEvent, EventHint, Primitive } from '@sentry/core';
import { captureSentryEvent } from './captured-events';

function stringifyPrimitive(value: Primitive): string | undefined {
  if (value === undefined) return undefined;
  return String(value);
}

type SentryHookEvent = {
  tags?: Record<string, Primitive> | Record<string, string>;
  extra?: Record<string, unknown>;
  exception?: { values?: Array<{ type?: string; value?: string }> };
};

function normalizeTags(tags: SentryHookEvent['tags']): Record<string, string> {
  if (!tags) return {};

  return Object.fromEntries(
    Object.entries(tags).flatMap(([key, value]) => {
      const normalized = stringifyPrimitive(value);
      return normalized === undefined ? [] : [[key, normalized]];
    }),
  );
}

export function sentryBeforeSendHook(event: SentryHookEvent, _hint?: EventHint): ErrorEvent {
  const message =
    event.exception?.values?.[0]?.value ?? event.exception?.values?.[0]?.type ?? undefined;

  captureSentryEvent({
    tags: normalizeTags(event.tags),
    extra: (event.extra as Record<string, unknown>) ?? {},
    message,
  }).catch(() => {});

  return event as ErrorEvent;
}

export function shouldUseSentryTestTransport(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.E2E_TEST_MODE === '1';
}

export function isTestMode(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || process.env.E2E_TEST_MODE === '1'
  );
}
