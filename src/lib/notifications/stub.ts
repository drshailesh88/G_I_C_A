/**
 * Notification Service Stub
 *
 * Phase 4 will implement the real notification service with
 * Resend (email) and Evolution API (WhatsApp).
 *
 * For now, all sends are logged to console.
 */

export type NotificationChannel = 'email' | 'whatsapp';

export type NotificationSendParams = {
  channel: NotificationChannel;
  templateKey: string;
  recipientPersonId: string;
  recipientEmail?: string;
  recipientPhoneE164?: string;
  variables: Record<string, unknown>;
  eventId: string;
  idempotencyKey: string;
};

/** Stub: logs notification instead of sending */
export async function sendNotification(params: NotificationSendParams): Promise<{
  sent: false;
  reason: 'stubbed';
}> {
  console.log('[notification:stub]', {
    channel: params.channel,
    templateKey: params.templateKey,
    recipientPersonId: params.recipientPersonId,
    eventId: params.eventId,
    idempotencyKey: params.idempotencyKey,
  });

  return { sent: false, reason: 'stubbed' };
}

/** Stub: always returns false (not a real idempotency check yet) */
export async function checkIdempotencyKey(_key: string): Promise<boolean> {
  return false;
}
