/**
 * Notification Service — Public API
 *
 * Modules should import from this file, not from individual providers.
 */

export { sendNotification, resendNotification, retryFailedNotification } from './send';
export type { NotificationServiceDeps } from './send';

export {
  createLogEntry,
  updateLogStatus,
  getLogById,
  listFailedLogs,
} from './log-queries';

export { resendEmailProvider } from './email';
export { evolutionWhatsAppProvider } from './whatsapp';
export { redisIdempotencyService } from './idempotency';

export type {
  Channel,
  SendNotificationInput,
  SendNotificationResult,
  SendEmailInput,
  SendWhatsAppInput,
  ProviderSendResult,
  EmailProvider,
  WhatsAppProvider,
  IdempotencyService,
  NotificationStatus,
  RecipientRef,
  AttachmentDescriptor,
  CreateLogEntryInput,
  UpdateLogStatusInput,
  ListFailedLogsFilters,
} from './types';
