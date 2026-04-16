import { getLogById, updateLogStatus } from '@/lib/notifications/log-queries';
import { captureError } from '@/lib/sentry';
import { upsertRedFlag } from '@/lib/cascade/red-flags';
import type { TargetEntityType, SourceEntityType } from '@/lib/cascade/red-flags';
import type { Channel, SendNotificationResult } from '@/lib/notifications/types';

const CASCADE_NOTIFICATION_MAX_ATTEMPTS = 3;

export class CascadeNotificationRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CascadeNotificationRetryError';
  }
}

export type DeadLetterInput = {
  eventId: string;
  cascadeEvent: string;
  payload: Record<string, unknown>;
  attempts: number;
  channel: string;
  triggerId: string;
  lastError: { code?: string; message: string };
  targetEntityType: TargetEntityType;
  targetEntityId: string;
  notificationLogId: string;
};

export async function handleDeadLetter(input: DeadLetterInput): Promise<void> {
  const {
    eventId,
    cascadeEvent,
    payload,
    attempts,
    channel,
    triggerId,
    lastError,
    targetEntityType,
    targetEntityId,
    notificationLogId,
  } = input;

  await updateLogStatus(notificationLogId, eventId, {
    status: 'failed',
    lastErrorCode: lastError.code ?? null,
    lastErrorMessage: lastError.message,
    failedAt: new Date(),
  });

  captureError(new Error(lastError.message), {
    module: 'cascade',
    tags: {
      kind: 'cascade-dispatch-failure',
      cascade_event: cascadeEvent,
      channel,
    },
    extra: {
      cascadeEvent,
      payload,
      attempts,
      channel,
      triggerId,
      eventId,
    },
  });

  await upsertRedFlag({
    eventId,
    flagType: 'system_dispatch_failure',
    flagDetail: `Cascade dispatch failed after ${attempts} attempts: ${lastError.message}`,
    targetEntityType,
    targetEntityId,
    sourceEntityType: 'cascade_dispatch' as SourceEntityType,
    sourceEntityId: triggerId,
    sourceChangeSummaryJson: {
      cascadeEvent,
      attempts,
      channel,
      lastErrorCode: lastError.code ?? null,
    },
  });
}

export async function handleCascadeNotificationResult(input: {
  eventId: string;
  cascadeEvent: string;
  payload: Record<string, unknown>;
  channel: Channel;
  triggerId: string;
  targetEntityType: TargetEntityType;
  targetEntityId: string;
  result: SendNotificationResult | undefined;
  maxAttempts?: number;
}): Promise<void> {
  if (!input.result || input.result.status !== 'failed') return;

  const log = await getLogById(input.result.notificationLogId, input.eventId);
  const attempts = log?.attempts ?? 1;
  const lastError = {
    code: log?.lastErrorCode ?? undefined,
    message: log?.lastErrorMessage ?? 'Cascade notification dispatch failed',
  };

  if (attempts >= (input.maxAttempts ?? CASCADE_NOTIFICATION_MAX_ATTEMPTS)) {
    await handleDeadLetter({
      eventId: input.eventId,
      cascadeEvent: input.cascadeEvent,
      payload: input.payload,
      attempts,
      channel: input.channel,
      triggerId: input.triggerId,
      lastError,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      notificationLogId: input.result.notificationLogId,
    });
    return;
  }

  throw new CascadeNotificationRetryError(
    `Cascade notification ${input.result.notificationLogId} failed on attempt ${attempts}`,
  );
}
