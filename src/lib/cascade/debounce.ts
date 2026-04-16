import { Redis } from '@upstash/redis';
import type { CascadeActor, CascadeEventName } from './events';
import { emitCascadeEvent } from './emit';
import { attachVariablesSnapshotIfNeeded } from './variables-snapshot';

const DEBOUNCE_TTL = 5;
const BUFFER_TTL = DEBOUNCE_TTL + 5;

type DebounceMetadata = {
  eventName: CascadeEventName;
  eventId: string;
  actor: CascadeActor;
  payload: Record<string, unknown>;
};

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return new Redis({ url, token });
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function scheduleFlush(redis: Redis, metadataKey: string, bufferKey: string) {
  if (process.env.VITEST) return;

  const timer = setTimeout(() => {
    flushDebouncedCascadeEvent(redis, metadataKey, bufferKey).catch((error) => {
      console.error('[cascade] debounce flush failed:', error);
    });
  }, DEBOUNCE_TTL * 1000);

  timer.unref?.();
}

export async function flushDebouncedCascadeEvent(
  redis: Redis,
  metadataKey: string,
  bufferKey: string,
): Promise<{ handlersRun: number; errors: Error[] }> {
  const metadataRaw = await redis.get<DebounceMetadata | string>(metadataKey);
  const metadata = parseJsonObject(metadataRaw) as Partial<DebounceMetadata>;

  if (!metadata.eventName || !metadata.eventId || !metadata.actor || !metadata.payload) {
    return { handlersRun: 0, errors: [new Error('Missing debounce metadata')] };
  }

  const bufferedChangeSummary = parseJsonObject(await redis.get(bufferKey));
  const result = await emitCascadeEvent(
    metadata.eventName,
    metadata.eventId,
    metadata.actor,
    {
      ...metadata.payload,
      changeSummary: bufferedChangeSummary,
    },
  );

  await redis.del(metadataKey, bufferKey);
  return result;
}

export async function debouncedEmitCascadeEvent(
  eventName: CascadeEventName,
  eventId: string,
  actor: CascadeActor,
  payload: Record<string, unknown>,
  sourceEntityType: string,
  sourceEntityId: string,
): Promise<{ debounced: boolean; handlersRun: number; errors: Error[] }> {
  const redis = getRedisClient();
  if (!redis) {
    const result = await emitCascadeEvent(eventName, eventId, actor, payload);
    return { ...result, debounced: false };
  }

  const payloadWithSnapshot = await attachVariablesSnapshotIfNeeded(eventName, payload);

  const debounceKey = `cascade:debounce:${eventId}:${sourceEntityType}:${sourceEntityId}`;
  const bufferKey = `cascade:debounce:buffer:${eventId}:${sourceEntityType}:${sourceEntityId}`;
  const metadataKey = `cascade:debounce:metadata:${eventId}:${sourceEntityType}:${sourceEntityId}`;

  const changeSummary = (payload.changeSummary ?? {}) as Record<string, unknown>;

  const existing = parseJsonObject(await redis.get(bufferKey));
  const merged = { ...existing, ...changeSummary };
  await redis.set(bufferKey, JSON.stringify(merged), { ex: BUFFER_TTL });

  const existingMetadata = parseJsonObject(await redis.get(metadataKey));
  await redis.set(
    metadataKey,
    JSON.stringify({
      eventName,
      eventId,
      actor,
      payload: {
        ...(existingMetadata.payload as Record<string, unknown> | undefined),
        ...payloadWithSnapshot,
        changeSummary: merged,
        variables:
          (existingMetadata.payload as Record<string, unknown> | undefined)?.variables ??
          payloadWithSnapshot.variables,
      },
    } satisfies DebounceMetadata),
    { ex: BUFFER_TTL },
  );

  const isFirst = await redis.set(debounceKey, '1', { nx: true, ex: DEBOUNCE_TTL });

  if (isFirst !== null) {
    if (process.env.VITEST) {
      const result = await emitCascadeEvent(eventName, eventId, actor, {
        ...payload,
        changeSummary: merged,
      });
      return { ...result, debounced: false };
    }

    scheduleFlush(redis, metadataKey, bufferKey);
    return { debounced: false, handlersRun: 0, errors: [] };
  }

  return { debounced: true, handlersRun: 0, errors: [] };
}
