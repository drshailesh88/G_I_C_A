import { inngest } from './client';
import {
  handleTravelSaved,
  handleTravelUpdated,
  handleTravelCancelled,
} from '../cascade/handlers/travel-cascade';
import {
  handleAccommodationSaved,
  handleAccommodationUpdated,
  handleAccommodationCancelled,
} from '../cascade/handlers/accommodation-cascade';
import { handleRegistrationCreated } from '../cascade/handlers/registration-cascade';
import { handleSessionUpdated } from '../cascade/handlers/session-cascade';
import { handleCertificateGenerated } from '../cascade/handlers/certificate-cascade';
import { bulkInngestFunctions } from './bulk-functions';
import {
  findEventsNeedingBackup,
  generateEmergencyKit,
  buildCronBackupStorageKey,
} from '../exports/emergency-kit';
import { createR2Provider } from '@/lib/certificates/storage';
import { captureCascadeError } from '@/lib/sentry';

/** Travel created → notify delegate itinerary */
export const travelSavedFn = inngest.createFunction(
  {
    id: 'cascade-travel-saved',
    retries: 3,
    triggers: [{ event: 'conference/travel.saved' }],
  },
  async ({ event }) => {
    await handleTravelSaved({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

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

/** Accommodation created → notify delegate accommodation details */
export const accommodationSavedFn = inngest.createFunction(
  {
    id: 'cascade-accommodation-saved',
    retries: 3,
    triggers: [{ event: 'conference/accommodation.saved' }],
  },
  async ({ event }) => {
    await handleAccommodationSaved({
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

/** Registration created → send confirmation + assign QR */
export const registrationCreatedFn = inngest.createFunction(
  {
    id: 'cascade-registration-created',
    retries: 3,
    triggers: [{ event: 'conference/registration.created' }],
  },
  async ({ event }) => {
    await handleRegistrationCreated({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

/** Session updated → notify affected faculty */
export const sessionUpdatedFn = inngest.createFunction(
  {
    id: 'cascade-session-updated',
    retries: 3,
    triggers: [{ event: 'conference/session.updated' }],
  },
  async ({ event }) => {
    await handleSessionUpdated({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

/** Certificate generated → notify recipient */
export const certificateGeneratedFn = inngest.createFunction(
  {
    id: 'cascade-certificate-generated',
    retries: 3,
    triggers: [{ event: 'conference/certificate.generated' }],
  },
  async ({ event }) => {
    await handleCertificateGenerated({
      eventId: event.data.eventId,
      actor: event.data.actor,
      payload: event.data.payload,
    });
  },
);

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
  travelSavedFn,
  travelUpdatedFn,
  travelCancelledFn,
  accommodationSavedFn,
  accommodationUpdatedFn,
  accommodationCancelledFn,
  registrationCreatedFn,
  sessionUpdatedFn,
  certificateGeneratedFn,
  ...bulkInngestFunctions,
  preEventBackupFn,
];
