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

// ── Provider Input Types ───────────────────────────────────────

export type SendEmailInput = {
  eventId: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  fromDisplayName?: string | null;
  attachments?: AttachmentDescriptor[];
  metadata?: Record<string, string>;
};

export type SendWhatsAppInput = {
  eventId: string;
  toPhoneE164: string;
  body: string;
  mediaAttachments?: AttachmentDescriptor[];
  metadata?: Record<string, string>;
};

// ── Provider Interfaces ────────────────────────────────────────

export interface EmailProvider {
  send(input: SendEmailInput): Promise<ProviderSendResult>;
}

export interface WhatsAppProvider {
  sendText(input: SendWhatsAppInput): Promise<ProviderSendResult>;
}

// ── Idempotency Interface ──────────────────────────────────────

export interface IdempotencyService {
  /** Returns true if key already exists (duplicate). false if new. */
  checkAndSet(key: string, ttlSeconds?: number): Promise<boolean>;
}

// ── Log Query Types ────────────────────────────────────────────

export type CreateLogEntryInput = {
  eventId: string;
  personId: string;
  templateId: string | null;
  templateKeySnapshot: string | null;
  templateVersionNo: number | null;
  channel: Channel;
  provider: ProviderName;
  triggerType?: string | null;
  triggerEntityType?: string | null;
  triggerEntityId?: string | null;
  sendMode: SendMode;
  idempotencyKey: string;
  recipientEmail?: string | null;
  recipientPhoneE164?: string | null;
  renderedSubject?: string | null;
  renderedBody: string;
  renderedVariablesJson?: Record<string, unknown> | null;
  attachmentManifestJson?: AttachmentDescriptor[] | null;
  status?: NotificationStatus;
  initiatedByUserId?: string | null;
  isResend?: boolean;
  resendOfId?: string | null;
};

export type UpdateLogStatusInput = {
  status: NotificationStatus;
  providerMessageId?: string | null;
  providerConversationId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  sentAt?: Date | null;
  failedAt?: Date | null;
};

export type ListFailedLogsFilters = {
  channel?: Channel;
  templateKey?: string;
  limit?: number;
  offset?: number;
};
