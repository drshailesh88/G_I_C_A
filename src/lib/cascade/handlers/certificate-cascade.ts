import { onCascadeEvent } from '../emit';
import { CASCADE_EVENTS } from '../events';
import type { CertificateGeneratedPayload } from '../events';
import { captureCascadeError } from '@/lib/sentry';
import { sendNotification } from '@/lib/notifications/send';
import {
  CascadeNotificationRetryError,
  handleCascadeNotificationResult,
} from '../dead-letter';

export async function handleCertificateGenerated(params: {
  eventId: string;
  actor: { type: string; id: string };
  payload: Record<string, unknown>;
}) {
  const { eventId, payload } = params;
  const data = payload as unknown as CertificateGeneratedPayload;
  const ts = Date.now();

  try {
    const result = await sendNotification({
      eventId,
      personId: data.personId,
      channel: 'email',
      templateKey: 'certificate_ready',
      triggerType: 'certificate.generated',
      triggerEntityType: 'certificate',
      triggerEntityId: data.certificateId,
      sendMode: 'automatic',
      idempotencyKey: `notify:certificate-ready:${eventId}:${data.personId}:${data.certificateId}:${ts}:email`,
      variables: {
        certificateId: data.certificateId,
        templateId: data.templateId,
      },
    });
    await handleCascadeNotificationResult({
      eventId,
      cascadeEvent: 'conference/certificate.generated',
      payload,
      channel: 'email',
      triggerId: data.certificateId,
      targetEntityType: 'notification_log',
      targetEntityId: data.certificateId,
      result,
    });
  } catch (error) {
    if (error instanceof CascadeNotificationRetryError) {
      throw error;
    }

    console.error('[cascade:certificate] recipient notification failed:', error);
    captureCascadeError(error, {
      handler: 'certificate-cascade',
      eventId,
      cascadeEvent: 'certificate:generated',
    });
  }
}

export function registerCertificateCascadeHandlers() {
  onCascadeEvent(CASCADE_EVENTS.CERTIFICATE_GENERATED, handleCertificateGenerated);
}
