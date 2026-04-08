/**
 * Notification Service Types
 *
 * Shared types used across the notification service layer.
 * Mirrors SERVICE_CONTRACTS.md interfaces.
 */

export type Channel = 'email' | 'whatsapp';

export type NotificationTriggerType =
  | 'registration.created'
  | 'registration.cancelled'
  | 'faculty.invitation'
  | 'program.version_published'
  | 'session.cancelled'
  | 'travel.saved'
  | 'travel.updated'
  | 'travel.cancelled'
  | 'accommodation.saved'
  | 'accommodation.updated'
  | 'accommodation.cancelled'
  | 'transport.updated'
  | 'certificate.generated';

export type SendMode = 'automatic' | 'manual';

export type NotificationStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'retrying';

export type ProviderName = 'resend' | 'evolution_api' | 'waba';

export type RecipientRef = {
  personId: string;
  email?: string | null;
  phoneE164?: string | null;
  fullName?: string | null;
};

export type AttachmentDescriptor = {
  fileName: string;
  storageKey: string;
  contentType?: string;
};

export type TemplateRenderResult = {
  subject?: string | null;
  body: string;
  variables: Record<string, unknown>;
};

export type ProviderSendResult = {
  provider: string;
  providerMessageId?: string | null;
  providerConversationId?: string | null;
  accepted: boolean;
  rawStatus?: string | null;
};

export type SendNotificationInput = {
  eventId: string;
  personId: string;
  channel: Channel;
  templateKey: string;
  triggerType: NotificationTriggerType;
  triggerEntityType?: string;
  triggerEntityId?: string;
  sendMode: SendMode;
  initiatedByUserId?: string | null;
  idempotencyKey: string;
  variables: Record<string, unknown>;
  attachments?: AttachmentDescriptor[];
};

export type SendNotificationResult = {
  notificationLogId: string;
  provider: string;
  providerMessageId?: string | null;
  status: NotificationStatus;
};
