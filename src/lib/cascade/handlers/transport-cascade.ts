import { generateTransportSuggestions } from '@/lib/actions/transport';
import { captureCascadeError } from '@/lib/sentry';
import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';

async function runTransportSuggestionRefresh(eventId: string, cascadeEvent: string) {
  try {
    await generateTransportSuggestions(eventId);
  } catch (error) {
    captureCascadeError(error, {
      handler: 'transport-cascade',
      eventId,
      cascadeEvent,
    });
  }
}

export function registerTransportCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.TRAVEL_SAVED, async ({ eventId }) => {
    await runTransportSuggestionRefresh(eventId, CASCADE_EVENTS.TRAVEL_SAVED);
  });

  onCascadeEvent(CASCADE_EVENTS.TRAVEL_CREATED, async ({ eventId }) => {
    await runTransportSuggestionRefresh(eventId, CASCADE_EVENTS.TRAVEL_CREATED);
  });
}
