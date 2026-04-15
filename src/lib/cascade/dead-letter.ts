import { updateLogStatus } from '@/lib/notifications/log-queries';
import { captureError } from '@/lib/sentry';
import { upsertRedFlag } from '@/lib/cascade/red-flags';
import type { TargetEntityType, SourceEntityType } from '@/lib/cascade/red-flags';

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
