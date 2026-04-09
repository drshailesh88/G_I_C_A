/**
 * Inngest Functions — Cascade Handlers + Scheduled Jobs
 *
 * Each cascade handler is wrapped in an Inngest function with:
 * - Max 3 retries with exponential backoff (Inngest default backoff)
 * - Same handler logic as before — only the wrapper changed
 *
 * Scheduled jobs:
 * - Pre-event backup: daily cron checks for events starting within 24h
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
import {
  findEventsNeedingBackup,
  generateEmergencyKit,
  buildCronBackupStorageKey,
} from '../exports/emergency-kit';
import { createR2Provider } from '@/lib/certificates/storage';
import { captureCascadeError } from '@/lib/sentry';

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

/**
 * Pre-event backup — runs daily at 00:00 UTC.
 * Uses a 48h window so every event is backed up at least 24h before start,
 * regardless of timezone. Each event is isolated in its own step so one
 * failure doesn't abort backups for other events.
 */
export const preEventBackupFn = inngest.createFunction(
  {
    id: 'pre-event-backup',
    retries: 2,
    triggers: [{ cron: '0 0 * * *' }],
  },
  async ({ step }) => {
    const upcomingEvents = await step.run('find-upcoming-events', async () => {
      return findEventsNeedingBackup();
    });

    if (upcomingEvents.length === 0) {
      return { eventsProcessed: 0, succeeded: [], failed: [] };
    }

    const succeeded: Array<{ eventId: string; eventName: string; storageKey: string }> = [];
    const failed: Array<{ eventId: string; eventName: string; error: string }> = [];

    for (const event of upcomingEvents) {
      // Each event in its own step — failure is isolated per event
      try {
        const result = await step.run(`backup-${event.id}`, async () => {
          const storageProvider = createR2Provider();
          const kit = await generateEmergencyKit({
            eventId: event.id,
            storageProvider,
            storageKeyOverride: buildCronBackupStorageKey(event.id),
          });
          return { eventId: event.id, eventName: event.name, storageKey: kit.storageKey };
        });
        succeeded.push(result);
      } catch (error) {
        captureCascadeError(error, {
          handler: 'pre-event-backup',
          eventId: event.id,
          cascadeEvent: 'cron/pre-event-backup',
        });
        failed.push({
          eventId: event.id,
          eventName: event.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { eventsProcessed: succeeded.length + failed.length, succeeded, failed };
  },
);

/** All Inngest functions — pass this array to serve() */
export const inngestFunctions = [
  travelUpdatedFn,
  travelCancelledFn,
  accommodationUpdatedFn,
  accommodationCancelledFn,
  ...bulkInngestFunctions,
  preEventBackupFn,
];
