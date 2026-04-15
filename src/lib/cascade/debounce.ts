import { Redis } from '@upstash/redis';
import type { CascadeActor, CascadeEventName } from './events';
import { emitCascadeEvent } from './emit';

const DEBOUNCE_TTL = 5;
const BUFFER_TTL = DEBOUNCE_TTL + 5;

function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    );
  }
  return new Redis({ url, token });
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
  const debounceKey = `cascade:debounce:${eventId}:${sourceEntityType}:${sourceEntityId}`;
  const bufferKey = `cascade:debounce:buffer:${eventId}:${sourceEntityType}:${sourceEntityId}`;

  const changeSummary = (payload.changeSummary ?? {}) as Record<string, unknown>;

  const existingRaw = await redis.get<string>(bufferKey);
  const existing = existingRaw ? JSON.parse(existingRaw) : {};
  const merged = { ...existing, ...changeSummary };
  await redis.set(bufferKey, JSON.stringify(merged), { ex: BUFFER_TTL });

  const isFirst = await redis.set(debounceKey, '1', { nx: true, ex: DEBOUNCE_TTL });

  if (isFirst !== null) {
    const result = await emitCascadeEvent(eventName, eventId, actor, {
      ...payload,
      changeSummary: merged,
      _bufferKey: bufferKey,
    });
    return { ...result, debounced: false };
  }

  return { debounced: true, handlersRun: 0, errors: [] };
}
