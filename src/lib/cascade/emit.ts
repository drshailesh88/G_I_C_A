/**
 * Cascade Event Emitter
 *
 * Production: sends events through Inngest for durable, retried execution.
 * Test: runs handlers synchronously via in-memory registry (for unit tests).
 *
 * Usage: await emitCascadeEvent('conference/travel.updated', eventId, actor, payload)
 */

import type { CascadeActor, CascadeEventName } from './events';
import { inngest } from '../inngest/client';
import { captureCascadeError } from '../sentry';
import { captureInngestEvent } from '../inngest/captured-events';

type CascadeHandler = (params: {
  eventId: string;
  actor: CascadeActor;
  payload: Record<string, unknown>;
}) => Promise<void>;

// In-memory registry — used only in test mode
const handlerRegistry = new Map<string, CascadeHandler[]>();

/** Whether to use in-memory handlers (test mode) vs Inngest (production) */
let useInMemoryMode = false;

/** Enable in-memory mode for tests */
export function enableTestMode() {
  useInMemoryMode = true;
}

/** Disable in-memory mode (back to Inngest) */
export function disableTestMode() {
  useInMemoryMode = false;
}

/** Register a handler for a cascade event (test mode only — in production, Inngest functions handle events) */
export function onCascadeEvent(eventName: CascadeEventName, handler: CascadeHandler) {
  const existing = handlerRegistry.get(eventName) ?? [];
  existing.push(handler);
  handlerRegistry.set(eventName, existing);
}

/** Emit a cascade event — sends to Inngest in production, runs in-memory in tests */
export async function emitCascadeEvent(
  eventName: CascadeEventName,
  eventId: string,
  actor: CascadeActor,
  payload: Record<string, unknown>,
): Promise<{ handlersRun: number; errors: Error[] }> {
  // Test mode: run in-memory handlers synchronously (existing behavior)
  if (useInMemoryMode) {
    const handlers = handlerRegistry.get(eventName) ?? [];
    const errors: Error[] = [];

    for (const handler of handlers) {
      try {
        await handler({ eventId, actor, payload });
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
        console.error(`[cascade] Handler error for ${eventName}:`, err);
      }
    }

    return { handlersRun: handlers.length, errors };
  }

  // Production mode: send event to Inngest
  try {
    const inngestEventId = crypto.randomUUID();
    const eventData = { eventId, actor, payload };
    await inngest.send({
      id: inngestEventId,
      name: eventName,
      data: eventData,
    });
    await captureInngestEvent({ id: inngestEventId, name: eventName, data: eventData as Record<string, unknown> }).catch(() => {});
    return { handlersRun: 1, errors: [] };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[cascade] Inngest send error for ${eventName}:`, err);
    captureCascadeError(err, {
      handler: 'inngest-emit',
      eventId,
      cascadeEvent: eventName,
    });
    return { handlersRun: 0, errors: [error] };
  }
}

/** Clear all registered handlers (for testing) */
export function clearCascadeHandlers() {
  handlerRegistry.clear();
}

/** Get registered handler count for an event (for testing) */
export function getHandlerCount(eventName: CascadeEventName): number {
  return (handlerRegistry.get(eventName) ?? []).length;
}
