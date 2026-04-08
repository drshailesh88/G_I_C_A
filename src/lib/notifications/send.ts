/**
 * NotificationService — Main Orchestration
 *
 * Coordinates idempotency check, template rendering, provider routing,
 * and notification log persistence.
 */

import type {
  SendNotificationInput,
  SendNotificationResult,
  NotificationStatus,
  EmailProvider,
  WhatsAppProvider,
  IdempotencyService,
  ProviderSendResult,
  Channel,
} from './types';
import { renderTemplate } from './template-renderer';
import {
  createLogEntry,
  updateLogStatus,
  getLogById,
} from './log-queries';
import { resendEmailProvider } from './email';
import { evolutionWhatsAppProvider } from './whatsapp';
import { redisIdempotencyService } from './idempotency';

// ── Dependency injection for testability ──────────────────────

export type NotificationServiceDeps = {
  emailProvider: EmailProvider;
  whatsAppProvider: WhatsAppProvider;
  idempotencyService: IdempotencyService;
  renderTemplateFn: typeof renderTemplate;
  createLogEntryFn: typeof createLogEntry;
  updateLogStatusFn: typeof updateLogStatus;
  getLogByIdFn: typeof getLogById;
};

const defaultDeps: NotificationServiceDeps = {
  emailProvider: resendEmailProvider,
  whatsAppProvider: evolutionWhatsAppProvider,
  idempotencyService: redisIdempotencyService,
  renderTemplateFn: renderTemplate,
  createLogEntryFn: createLogEntry,
  updateLogStatusFn: updateLogStatus,
  getLogByIdFn: getLogById,
};

// ── Helpers ───────────────────────────────────────────────────

function providerNameForChannel(channel: Channel): 'resend' | 'evolution_api' {
  return channel === 'email' ? 'resend' : 'evolution_api';
}

// ── Main Send ─────────────────────────────────────────────────

export async function sendNotification(
  input: SendNotificationInput,
  deps: NotificationServiceDeps = defaultDeps,
): Promise<SendNotificationResult> {
  const {
    emailProvider,
    whatsAppProvider,
    idempotencyService,
    renderTemplateFn,
    createLogEntryFn,
    updateLogStatusFn,
  } = deps;

  // 1. Idempotency check
  const isDuplicate = await idempotencyService.checkAndSet(input.idempotencyKey);
  if (isDuplicate) {
    // Return a result indicating this was already sent.
    // We don't have the original log ID readily available without a DB lookup,
    // so we return a synthetic result.
    return {
      notificationLogId: '',
      provider: providerNameForChannel(input.channel),
      providerMessageId: null,
      status: 'sent' as NotificationStatus,
    };
  }

  // 2. Render template
  const rendered = await renderTemplateFn({
    eventId: input.eventId,
    channel: input.channel,
    templateKey: input.templateKey,
    variables: input.variables,
  });

  // 3. Create log row (status = queued)
  const logRow = await createLogEntryFn({
    eventId: input.eventId,
    personId: input.personId,
    templateId: rendered.templateId,
    templateKeySnapshot: input.templateKey,
    templateVersionNo: rendered.templateVersionNo,
    channel: input.channel,
    provider: providerNameForChannel(input.channel),
    triggerType: input.triggerType,
    triggerEntityType: input.triggerEntityType ?? null,
    triggerEntityId: input.triggerEntityId ?? null,
    sendMode: input.sendMode,
    idempotencyKey: input.idempotencyKey,
    recipientEmail: input.channel === 'email' ? (input.variables['recipientEmail'] as string ?? null) : null,
    recipientPhoneE164: input.channel === 'whatsapp' ? (input.variables['recipientPhoneE164'] as string ?? null) : null,
    renderedSubject: rendered.subject,
    renderedBody: rendered.body,
    renderedVariablesJson: rendered.variables,
    attachmentManifestJson: input.attachments ?? null,
    status: 'queued',
    initiatedByUserId: input.initiatedByUserId ?? null,
  });

  // 4. Route to provider
  let providerResult: ProviderSendResult;

  try {
    if (input.channel === 'email') {
      providerResult = await emailProvider.send({
        eventId: input.eventId,
        toEmail: input.variables['recipientEmail'] as string,
        subject: rendered.subject ?? '',
        htmlBody: rendered.body,
        attachments: input.attachments,
      });
    } else {
      providerResult = await whatsAppProvider.sendText({
        eventId: input.eventId,
        toPhoneE164: input.variables['recipientPhoneE164'] as string,
        body: rendered.body,
        mediaAttachments: input.attachments,
      });
    }
  } catch (error) {
    // Provider threw — mark as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateLogStatusFn(logRow.id, input.eventId, {
      status: 'failed',
      lastErrorCode: 'PROVIDER_EXCEPTION',
      lastErrorMessage: errorMessage,
      failedAt: new Date(),
    });
    return {
      notificationLogId: logRow.id,
      provider: providerNameForChannel(input.channel),
      providerMessageId: null,
      status: 'failed',
    };
  }

  // 5. Update log with provider response
  const finalStatus: NotificationStatus = providerResult.accepted ? 'sent' : 'failed';

  await updateLogStatusFn(logRow.id, input.eventId, {
    status: finalStatus,
    providerMessageId: providerResult.providerMessageId,
    providerConversationId: providerResult.providerConversationId,
    ...(providerResult.accepted
      ? { sentAt: new Date() }
      : {
          failedAt: new Date(),
          lastErrorCode: 'PROVIDER_REJECTED',
          lastErrorMessage: providerResult.rawStatus ?? 'Provider rejected the message',
        }),
  });

  return {
    notificationLogId: logRow.id,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId,
    status: finalStatus,
  };
}

// ── Resend (re-send a previously sent notification) ──────────

export async function resendNotification(params: {
  eventId: string;
  notificationLogId: string;
  initiatedByUserId: string;
}, deps: NotificationServiceDeps = defaultDeps): Promise<SendNotificationResult> {
  const { getLogByIdFn } = deps;

  const originalLog = await getLogByIdFn(params.notificationLogId, params.eventId);
  if (!originalLog) {
    throw new Error(
      `Notification log ${params.notificationLogId} not found for event ${params.eventId}`,
    );
  }

  // Create a new send with a fresh idempotency key, linking back to original
  const newIdempotencyKey = `resend:${originalLog.id}:${Date.now()}`;

  const result = await sendNotificationFromLog(originalLog, {
    idempotencyKey: newIdempotencyKey,
    initiatedByUserId: params.initiatedByUserId,
    isResend: true,
    resendOfId: originalLog.id,
  }, deps);

  return result;
}

// ── Retry (retry a failed notification) ──────────────────────

export async function retryFailedNotification(params: {
  eventId: string;
  notificationLogId: string;
  initiatedByUserId: string;
}, deps: NotificationServiceDeps = defaultDeps): Promise<SendNotificationResult> {
  const { getLogByIdFn, updateLogStatusFn } = deps;

  const originalLog = await getLogByIdFn(params.notificationLogId, params.eventId);
  if (!originalLog) {
    throw new Error(
      `Notification log ${params.notificationLogId} not found for event ${params.eventId}`,
    );
  }
  if (originalLog.status !== 'failed') {
    throw new Error(
      `Cannot retry notification ${params.notificationLogId} — status is "${originalLog.status}", expected "failed"`,
    );
  }

  // Mark as retrying
  await updateLogStatusFn(originalLog.id, params.eventId, { status: 'retrying' });

  // Re-send using stored rendered content
  const newIdempotencyKey = `retry:${originalLog.id}:${Date.now()}`;

  const result = await sendNotificationFromLog(originalLog, {
    idempotencyKey: newIdempotencyKey,
    initiatedByUserId: params.initiatedByUserId,
    isResend: false,
    resendOfId: originalLog.id,
  }, deps);

  return result;
}

// ── Internal: send from an existing log row's data ───────────

async function sendNotificationFromLog(
  log: Awaited<ReturnType<typeof getLogById>> & Record<string, unknown>,
  overrides: {
    idempotencyKey: string;
    initiatedByUserId: string;
    isResend: boolean;
    resendOfId: string;
  },
  deps: NotificationServiceDeps,
): Promise<SendNotificationResult> {
  const {
    emailProvider,
    whatsAppProvider,
    createLogEntryFn,
    updateLogStatusFn,
  } = deps;

  const channel = log.channel as Channel;

  // Create new log entry
  const newLog = await createLogEntryFn({
    eventId: log.eventId as string,
    personId: log.personId as string,
    templateId: (log.templateId as string) ?? null,
    templateKeySnapshot: (log.templateKeySnapshot as string) ?? null,
    templateVersionNo: (log.templateVersionNo as number) ?? null,
    channel,
    provider: providerNameForChannel(channel),
    triggerType: (log.triggerType as string) ?? null,
    triggerEntityType: (log.triggerEntityType as string) ?? null,
    triggerEntityId: (log.triggerEntityId as string) ?? null,
    sendMode: log.sendMode as 'automatic' | 'manual',
    idempotencyKey: overrides.idempotencyKey,
    recipientEmail: (log.recipientEmail as string) ?? null,
    recipientPhoneE164: (log.recipientPhoneE164 as string) ?? null,
    renderedSubject: (log.renderedSubject as string) ?? null,
    renderedBody: log.renderedBody as string,
    renderedVariablesJson: (log.renderedVariablesJson as Record<string, unknown>) ?? null,
    attachmentManifestJson: null,
    status: 'queued',
    initiatedByUserId: overrides.initiatedByUserId,
    isResend: overrides.isResend,
    resendOfId: overrides.resendOfId,
  });

  // Route to provider
  let providerResult: ProviderSendResult;
  try {
    if (channel === 'email') {
      providerResult = await emailProvider.send({
        eventId: log.eventId as string,
        toEmail: (log.recipientEmail as string) ?? '',
        subject: (log.renderedSubject as string) ?? '',
        htmlBody: log.renderedBody as string,
      });
    } else {
      providerResult = await whatsAppProvider.sendText({
        eventId: log.eventId as string,
        toPhoneE164: (log.recipientPhoneE164 as string) ?? '',
        body: log.renderedBody as string,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateLogStatusFn(newLog.id, log.eventId as string, {
      status: 'failed',
      lastErrorCode: 'PROVIDER_EXCEPTION',
      lastErrorMessage: errorMessage,
      failedAt: new Date(),
    });
    return {
      notificationLogId: newLog.id,
      provider: providerNameForChannel(channel),
      providerMessageId: null,
      status: 'failed',
    };
  }

  const finalStatus: NotificationStatus = providerResult.accepted ? 'sent' : 'failed';
  await updateLogStatusFn(newLog.id, log.eventId as string, {
    status: finalStatus,
    providerMessageId: providerResult.providerMessageId,
    providerConversationId: providerResult.providerConversationId,
    ...(providerResult.accepted
      ? { sentAt: new Date() }
      : {
          failedAt: new Date(),
          lastErrorCode: 'PROVIDER_REJECTED',
          lastErrorMessage: providerResult.rawStatus ?? 'Provider rejected',
        }),
  });

  return {
    notificationLogId: newLog.id,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId,
    status: finalStatus,
  };
}
