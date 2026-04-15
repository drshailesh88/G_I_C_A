import { inngest } from './client';
import { recordInngestAttempt } from './captured-events';
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
import { validateCascadePayload } from '../cascade/payload-validation';
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/travel.saved', event.data);
      await handleTravelSaved({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/travel.updated', event.data);
      await handleTravelUpdated({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/travel.cancelled', event.data);
      await handleTravelCancelled({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/accommodation.saved', event.data);
      await handleAccommodationSaved({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/accommodation.updated', event.data);
      await handleAccommodationUpdated({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/accommodation.cancelled', event.data);
      await handleAccommodationCancelled({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/registration.created', event.data);
      await handleRegistrationCreated({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/session.updated', event.data);
      await handleSessionUpdated({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
    const inngestEventId = (event as Record<string, unknown>).id as string | undefined;
    try {
      const data = validateCascadePayload('conference/certificate.generated', event.data);
      await handleCertificateGenerated({ eventId: data.eventId, actor: data.actor, payload: data.payload });
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'completed').catch(() => {});
    } catch (err) {
      if (inngestEventId) await recordInngestAttempt(inngestEventId, 'failed').catch(() => {});
      throw err;
    }
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
