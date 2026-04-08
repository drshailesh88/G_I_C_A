/**
 * Cascade Event Emitter
 *
 * Abstraction over the event bus. In production this will use Inngest.
 * For now, it runs handlers synchronously (in-process) since Inngest
 * is not yet installed. The interface stays the same.
 *
 * Usage: await emitCascadeEvent('conference/travel.updated', eventId, actor, payload)
 */

import type { CascadeActor, CascadeEventName } from './events';

type CascadeHandler = (params: {
  eventId: string;
  actor: CascadeActor;
  payload: Record<string, unknown>;
}) => Promise<void>;

// Registry of handlers per event name
const handlerRegistry = new Map<string, CascadeHandler[]>();

/** Register a handler for a cascade event */
export function onCascadeEvent(eventName: CascadeEventName, handler: CascadeHandler) {
  const existing = handlerRegistry.get(eventName) ?? [];
  existing.push(handler);
  handlerRegistry.set(eventName, existing);
}

/** Emit a cascade event — fans out to all registered handlers */
export async function emitCascadeEvent(
  eventName: CascadeEventName,
  eventId: string,
  actor: CascadeActor,
  payload: Record<string, unknown>,
): Promise<{ handlersRun: number; errors: Error[] }> {
  const handlers = handlerRegistry.get(eventName) ?? [];
  const errors: Error[] = [];

  // Fan out to all handlers — continue on individual handler failure
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

/** Clear all registered handlers (for testing) */
export function clearCascadeHandlers() {
  handlerRegistry.clear();
}

/** Get registered handler count for an event (for testing) */
export function getHandlerCount(eventName: CascadeEventName): number {
  return (handlerRegistry.get(eventName) ?? []).length;
}
