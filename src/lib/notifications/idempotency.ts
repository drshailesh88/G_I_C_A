/**
 * Idempotency Service — Redis-backed
 *
 * Uses @upstash/redis to implement at-most-once delivery checks.
 * Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from environment.
 */

import { Redis } from '@upstash/redis';
import type { IdempotencyService, Channel } from './types';

export function buildIdempotencyKey(params: {
  userId: string;
  eventId: string;
  type: string;
  triggerId: string;
  channel: Channel;
}): string {
  return `notification:${params.userId}:${params.eventId}:${params.type}:${params.triggerId}:${params.channel}`;
}

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const KEY_PREFIX = 'notif:idem:';

function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables must be set',
    );
  }
  return new Redis({ url, token });
}

export const redisIdempotencyService: IdempotencyService = {
  async checkAndSet(key: string, ttlSeconds = SEVEN_DAYS_SECONDS): Promise<boolean> {
    const redis = getRedisClient();
    const prefixedKey = `${KEY_PREFIX}${key}`;

    // SET NX returns "OK" if the key was set, null if it already existed
    const result = await redis.set(prefixedKey, '1', { nx: true, ex: ttlSeconds });

    // If result is null, the key already existed -> duplicate
    return result === null;
  },
};

/** Exported for testing — creates an idempotency service with injected Redis */
export function createIdempotencyService(redis: Redis): IdempotencyService {
  return {
    async checkAndSet(key: string, ttlSeconds = SEVEN_DAYS_SECONDS): Promise<boolean> {
      const prefixedKey = `${KEY_PREFIX}${key}`;
      const result = await redis.set(prefixedKey, '1', { nx: true, ex: ttlSeconds });
      return result === null;
    },
  };
}
