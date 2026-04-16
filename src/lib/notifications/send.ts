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
  AttachmentDescriptor,
} from './types';
import { renderTemplate } from './template-renderer';
import {
  createLogEntry,
  updateLogStatus,
  getLogById,
  markAsRetrying,
} from './log-queries';
import { resendEmailProvider } from './email';
import { evolutionWhatsAppProvider } from './whatsapp';
import {
  buildIdempotencyKey,
  redisIdempotencyService,
} from './idempotency';
import {
  createShimmedEmailProvider,
  createShimmedWhatsAppProvider,
} from './provider-mode';
import type { CircuitBreakerService } from './circuit-breaker';
import { ProviderTimeoutError } from './timeout';
import { CircuitOpenError } from './circuit-breaker';
import { captureNotificationError } from '@/lib/sentry';
import { isChannelEnabled, type FlagReader } from '@/lib/flags';

// ── Dependency injection for testability ──────────────────────

export type NotificationServiceDeps = {
  emailProvider: EmailProvider;
  whatsAppProvider: WhatsAppProvider;
  idempotencyService: IdempotencyService;
  circuitBreaker?: CircuitBreakerService | null;
  renderTemplateFn: typeof renderTemplate;
  createLogEntryFn: typeof createLogEntry;
  updateLogStatusFn: typeof updateLogStatus;
  getLogByIdFn: typeof getLogById;
  flagService?: FlagReader | null;
};

const defaultDeps: NotificationServiceDeps = {
  emailProvider: createShimmedEmailProvider(resendEmailProvider),
  whatsAppProvider: createShimmedWhatsAppProvider(evolutionWhatsAppProvider),
  idempotencyService: redisIdempotencyService,
  circuitBreaker: null, // Set via getDefaultCircuitBreaker() in production wiring
  renderTemplateFn: renderTemplate,
  createLogEntryFn: createLogEntry,
  updateLogStatusFn: updateLogStatus,
  getLogByIdFn: getLogById,
  flagService: null, // Uses default flag service when null
};

// ── Helpers ───────────────────────────────────────────────────

function providerNameForChannel(channel: Channel): 'resend' | 'evolution_api' {
  return channel === 'email' ? 'resend' : 'evolution_api';
}

const CANONICAL_TRIGGER_TYPES: Partial<Record<string, string>> = {
  'travel.saved': 'travel_confirmed',
  'travel.updated': 'travel_updated',
  'travel.cancelled': 'travel_cancelled',
  'accommodation.saved': 'accommodation_confirmed',
  'accommodation.updated': 'accommodation_updated',
  'accommodation.cancelled': 'accommodation_cancelled',
  'registration.created': 'registration_confirmed',
  'session.updated': 'session_updated',
  'certificate.generated': 'certificate_ready',
};

function canonicalNotificationType(triggerType: string): string {
  return CANONICAL_TRIGGER_TYPES[triggerType] ?? triggerType.replace(/\./g, '_');
}

function normalizeIdempotencyKey(input: SendNotificationInput): string {
  if (
    !input.idempotencyKey.startsWith('notify:') &&
    !input.idempotencyKey.startsWith('notify|')
  ) {
    return input.idempotencyKey;
  }

  return buildIdempotencyKey({
    userId: input.personId,
    eventId: input.eventId,
    type: canonicalNotificationType(input.triggerType),
    triggerId: input.triggerEntityId ?? input.idempotencyKey,
    channel: input.channel,
  });
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
  const idempotencyKey = normalizeIdempotencyKey(input);

  // 0. Feature flag check — skip with audit log if channel is disabled
  try {
    const channelEnabled = await isChannelEnabled(
      input.channel,
      deps.flagService ?? undefined,
    );
    if (!channelEnabled) {
      // Create a log entry so the skip is auditable
      const skipLog = await createLogEntryFn({
        eventId: input.eventId,
        personId: input.personId,
        templateId: null,
        templateKeySnapshot: input.templateKey,
        templateVersionNo: null,
        channel: input.channel,
        provider: providerNameForChannel(input.channel),
        triggerType: input.triggerType,
        triggerEntityType: input.triggerEntityType ?? null,
        triggerEntityId: input.triggerEntityId ?? null,
        sendMode: input.sendMode,
        idempotencyKey,
        recipientEmail: input.channel === 'email' ? (input.variables['recipientEmail'] as string ?? null) : null,
        recipientPhoneE164: input.channel === 'whatsapp' ? (input.variables['recipientPhoneE164'] as string ?? null) : null,
        renderedSubject: null,
        renderedBody: `[CHANNEL_DISABLED] ${input.channel} channel is disabled via feature flag`,
        renderedVariablesJson: input.variables,
        attachmentManifestJson: input.attachments ?? null,
        status: 'sent', // Not a failure — intentionally skipped
        initiatedByUserId: input.initiatedByUserId ?? null,
      });
      return {
        notificationLogId: skipLog.id,
        provider: providerNameForChannel(input.channel),
        providerMessageId: null,
        status: 'sent' as NotificationStatus,
      };
    }
  } catch {
    // Flag check is best-effort — proceed if Redis is down
  }

  // 1. Render template (before any durable side effects)
  let rendered;
  try {
    rendered = await renderTemplateFn({
      eventId: input.eventId,
      channel: input.channel,
      templateKey: input.templateKey,
      variables: input.variables,
    });
  } catch (renderError) {
    captureNotificationError(renderError, {
      channel: input.channel,
      eventId: input.eventId,
      personId: input.personId,
      templateKey: input.templateKey,
      provider: providerNameForChannel(input.channel),
      errorCode: 'RENDER_FAILED',
    });
    // FIX #7: Record failed send in audit trail even on template errors
    const failedLog = await createLogEntryFn({
      eventId: input.eventId,
      personId: input.personId,
      templateId: null,
      templateKeySnapshot: input.templateKey,
      templateVersionNo: null,
      channel: input.channel,
      provider: providerNameForChannel(input.channel),
      triggerType: input.triggerType,
      triggerEntityType: input.triggerEntityType ?? null,
      triggerEntityId: input.triggerEntityId ?? null,
      sendMode: input.sendMode,
      idempotencyKey,
      recipientEmail: input.channel === 'email' ? (input.variables['recipientEmail'] as string ?? null) : null,
      recipientPhoneE164: input.channel === 'whatsapp' ? (input.variables['recipientPhoneE164'] as string ?? null) : null,
      renderedSubject: null,
      renderedBody: `[RENDER_FAILED] ${renderError instanceof Error ? renderError.message : String(renderError)}`,
      renderedVariablesJson: input.variables,
      attachmentManifestJson: input.attachments ?? null,
      status: 'failed',
      initiatedByUserId: input.initiatedByUserId ?? null,
    });
    return {
      notificationLogId: failedLog.id,
      provider: providerNameForChannel(input.channel),
      providerMessageId: null,
      status: 'failed' as NotificationStatus,
    };
  }

  // 2. Create log row FIRST (status = queued) — durable record before idempotency
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
    idempotencyKey,
    recipientEmail: input.channel === 'email' ? (input.variables['recipientEmail'] as string ?? null) : null,
    recipientPhoneE164: input.channel === 'whatsapp' ? (input.variables['recipientPhoneE164'] as string ?? null) : null,
    renderedSubject: rendered.subject,
    renderedBody: rendered.body,
    renderedVariablesJson: rendered.variables,
    attachmentManifestJson: input.attachments ?? null,
    status: 'queued',
    initiatedByUserId: input.initiatedByUserId ?? null,
  });

  // 3. Idempotency check — AFTER log creation so we have an audit trail
  // FIX #1: If process dies after Redis SET but before provider call,
  // the queued log row exists and ops can see + retry it.
  const isDuplicate = await idempotencyService.checkAndSet(idempotencyKey);
  if (isDuplicate) {
    // Already sent — update our log as a duplicate detection record
    await updateLogStatusFn(logRow.id, input.eventId, {
      status: 'sent',
      lastErrorCode: 'IDEMPOTENCY_DUPLICATE',
      lastErrorMessage: 'Duplicate send detected — original already processed',
    });
    return {
      notificationLogId: logRow.id,
      provider: providerNameForChannel(input.channel),
      providerMessageId: null,
      status: 'sent' as NotificationStatus,
    };
  }

  // 4. Circuit breaker check
  const providerName = providerNameForChannel(input.channel);
  if (deps.circuitBreaker) {
    try {
      await deps.circuitBreaker.checkCircuit(providerName);
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        await updateLogStatusFn(logRow.id, input.eventId, {
          status: 'failed',
          lastErrorCode: 'CIRCUIT_OPEN',
          lastErrorMessage: error.message,
          failedAt: new Date(),
        });
        return {
          notificationLogId: logRow.id,
          provider: providerName,
          providerMessageId: null,
          status: 'failed',
        };
      }
      throw error;
    }
  }

  // 5. Route to provider
  let providerResult: ProviderSendResult;

  try {
    if (input.channel === 'email') {
      providerResult = await emailProvider.send({
        eventId: input.eventId,
        toEmail: input.variables['recipientEmail'] as string,
        subject: rendered.subject ?? '',
        htmlBody: rendered.body,
        fromDisplayName: rendered.brandingVars?.emailSenderName || undefined,
        attachments: input.attachments,
        metadata: input.triggerEntityId
          ? { 'x-trigger-id': input.triggerEntityId }
          : undefined,
      });
    } else {
      providerResult = await whatsAppProvider.sendText({
        eventId: input.eventId,
        toPhoneE164: input.variables['recipientPhoneE164'] as string,
        body: rendered.body,
        mediaAttachments: input.attachments,
        metadata: input.triggerEntityId
          ? { 'x-trigger-id': input.triggerEntityId }
          : undefined,
      });
    }
  } catch (error) {
    // Determine error code based on error type
    const isTimeout = error instanceof ProviderTimeoutError;
    const errorCode = isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_EXCEPTION';
    const errorMessage = error instanceof Error ? error.message : String(error);

    captureNotificationError(error, {
      channel: input.channel,
      eventId: input.eventId,
      personId: input.personId,
      templateKey: input.templateKey,
      provider: providerName,
      errorCode,
    });

    // Record failure in circuit breaker
    if (deps.circuitBreaker) {
      await deps.circuitBreaker.recordFailure(providerName);
    }

    await updateLogStatusFn(logRow.id, input.eventId, {
      status: 'failed',
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      failedAt: new Date(),
    });
    return {
      notificationLogId: logRow.id,
      provider: providerName,
      providerMessageId: null,
      status: 'failed',
    };
  }

  // 6. Update circuit breaker with result
  if (deps.circuitBreaker) {
    if (providerResult.accepted) {
      await deps.circuitBreaker.recordSuccess(providerName);
    } else {
      await deps.circuitBreaker.recordFailure(providerName);
    }
  }

  // 7. Update log with provider response
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

  // FIX #8: Atomically mark as retrying — prevents concurrent retry race
  const locked = await markAsRetrying(originalLog.id, params.eventId);
  if (!locked) {
    throw new Error(
      `Cannot retry notification ${params.notificationLogId} — another retry is already in progress`,
    );
  }

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
  const providerName = providerNameForChannel(channel);

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
    attachmentManifestJson: (log.attachmentManifestJson as AttachmentDescriptor[] | null) ?? null,
    status: 'queued',
    initiatedByUserId: overrides.initiatedByUserId,
    isResend: overrides.isResend,
    resendOfId: overrides.resendOfId,
  });

  // Circuit breaker check for resend/retry path
  if (deps.circuitBreaker) {
    try {
      await deps.circuitBreaker.checkCircuit(providerName);
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        await updateLogStatusFn(newLog.id, log.eventId as string, {
          status: 'failed',
          lastErrorCode: 'CIRCUIT_OPEN',
          lastErrorMessage: error.message,
          failedAt: new Date(),
        });
        return {
          notificationLogId: newLog.id,
          provider: providerName,
          providerMessageId: null,
          status: 'failed',
        };
      }
      throw error;
    }
  }

  // Route to provider
  let providerResult: ProviderSendResult;
  try {
    const attachments = (log.attachmentManifestJson as unknown as import('./types').AttachmentDescriptor[] | null) ?? undefined;
    if (channel === 'email') {
      providerResult = await emailProvider.send({
        eventId: log.eventId as string,
        toEmail: (log.recipientEmail as string) ?? '',
        subject: (log.renderedSubject as string) ?? '',
        htmlBody: log.renderedBody as string,
        attachments,
      });
    } else {
      providerResult = await whatsAppProvider.sendText({
        eventId: log.eventId as string,
        toPhoneE164: (log.recipientPhoneE164 as string) ?? '',
        body: log.renderedBody as string,
        mediaAttachments: attachments,
      });
    }
  } catch (error) {
    const isTimeout = error instanceof ProviderTimeoutError;
    const errorCode = isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_EXCEPTION';
    const errorMessage = error instanceof Error ? error.message : String(error);

    captureNotificationError(error, {
      channel,
      eventId: log.eventId as string,
      personId: log.personId as string,
      templateKey: (log.templateKeySnapshot as string) ?? undefined,
      provider: providerName,
      errorCode,
    });

    if (deps.circuitBreaker) {
      await deps.circuitBreaker.recordFailure(providerName);
    }

    await updateLogStatusFn(newLog.id, log.eventId as string, {
      status: 'failed',
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      failedAt: new Date(),
    });
    return {
      notificationLogId: newLog.id,
      provider: providerName,
      providerMessageId: null,
      status: 'failed',
    };
  }

  // Update circuit breaker with result
  if (deps.circuitBreaker) {
    if (providerResult.accepted) {
      await deps.circuitBreaker.recordSuccess(providerName);
    } else {
      await deps.circuitBreaker.recordFailure(providerName);
    }
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
