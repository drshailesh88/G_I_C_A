import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { RegistrationCreatedPayload } from '../events';
import { captureCascadeError } from '@/lib/sentry';
import { sendNotification } from '@/lib/notifications/send';

export async function handleRegistrationCreated(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as RegistrationCreatedPayload;
  const ts = Date.now();

  try {
    await sendNotification({
      eventId,
      personId: data.personId,
      channel: 'email',
      templateKey: 'registration_confirmation',
      triggerType: 'registration.created',
      triggerEntityType: 'registration',
      triggerEntityId: data.registrationId,
      sendMode: 'automatic',
      idempotencyKey: `notify:registration-confirmation:${eventId}:${data.personId}:${data.registrationId}:${ts}:email`,
      variables: { registrationId: data.registrationId },
    });
  } catch (error) {
    console.error('[cascade:registration] confirmation notification failed:', error);
    captureCascadeError(error, {
      handler: 'registration-cascade',
      eventId,
      cascadeEvent: 'registration:confirmation',
    });
  }
}

export function registerRegistrationCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.REGISTRATION_CREATED, handleRegistrationCreated);
}
