/**
 * Inngest Functions — Cascade Handlers
 *
 * Each cascade handler is wrapped in an Inngest function with:
 * - Max 3 retries with exponential backoff (Inngest default backoff)
 * - Same handler logic as before — only the wrapper changed
 *
 * These functions are registered with the Inngest serve() endpoint.
 */

import { inngest } from './client';
import {
  handleTravelUpdated,
  handleTravelCancelled,
} from '../cascade/handlers/travel-cascade';
import {
  handleAccommodationUpdated,
  handleAccommodationCancelled,
} from '../cascade/handlers/accommodation-cascade';
import { bulkInngestFunctions } from './bulk-functions';

/** Travel updated → flag accommodation + transport, notify delegate */
export const travelUpdatedFn = inngest.createFunction(
  {
    id: 'cascade-travel-updated',
    retries: 3,
    triggers: [{ event: 'conference/travel.updated' }],
  },
  async ({ event }) => {
    await handleTravelUpdated({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

/** Travel cancelled → high-severity flags, notify delegate */
export const travelCancelledFn = inngest.createFunction(
  {
    id: 'cascade-travel-cancelled',
    retries: 3,
    triggers: [{ event: 'conference/travel.cancelled' }],
  },
  async ({ event }) => {
    await handleTravelCancelled({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

/** Accommodation updated → flag transport, shared room flags, notify */
export const accommodationUpdatedFn = inngest.createFunction(
  {
    id: 'cascade-accommodation-updated',
    retries: 3,
    triggers: [{ event: 'conference/accommodation.updated' }],
  },
  async ({ event }) => {
    await handleAccommodationUpdated({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

/** Accommodation cancelled → flag transport, notify */
export const accommodationCancelledFn = inngest.createFunction(
  {
    id: 'cascade-accommodation-cancelled',
    retries: 3,
    triggers: [{ event: 'conference/accommodation.cancelled' }],
  },
  async ({ event }) => {
    await handleAccommodationCancelled({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

/** All Inngest functions — pass this array to serve() */
export const inngestFunctions = [
  travelUpdatedFn,
  travelCancelledFn,
  accommodationUpdatedFn,
  accommodationCancelledFn,
  ...bulkInngestFunctions,
];
