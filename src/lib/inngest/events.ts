/**
 * Inngest Event Type Definitions
 *
 * Maps cascade domain events to typed Inngest event payloads.
 * Every event includes eventId + actor for scoping and audit.
 */

import type { CascadeActor, CascadeEventName } from '../cascade/events';

/** Shape of every cascade event sent through Inngest */
export type CascadeInngestEventData = {
  eventId: string;
  actor: CascadeActor;
  payload: Record<string, unknown>;
};

/** Inngest event map — each cascade event name maps to its data shape */
export type InngestEvents = {
  'conference/travel.saved': { data: CascadeInngestEventData };
  'conference/travel.updated': { data: CascadeInngestEventData };
  'conference/travel.cancelled': { data: CascadeInngestEventData };
  'conference/accommodation.saved': { data: CascadeInngestEventData };
  'conference/accommodation.updated': { data: CascadeInngestEventData };
  'conference/accommodation.cancelled': { data: CascadeInngestEventData };
};

/** Validate that a cascade event name is a valid Inngest event name */
export function isValidInngestEvent(name: string): name is keyof InngestEvents {
  return name.startsWith('conference/');
}
