/**
 * Distributed Lock for Certificate Operations
 *
 * Uses @upstash/redis SET NX EX to prevent simultaneous bulk operations
 * for the same event/certificate type combination.
 *
 * Lock key: cert:lock:{eventId}:{certificateType}
 * Default TTL: 5 minutes (auto-release safety net)
 */

import { Redis } from '@upstash/redis';

const LOCK_PREFIX = 'cert:lock:';
const DEFAULT_LOCK_TTL_SECONDS = 300; // 5 minutes

export type DistributedLock = {
  /** Attempt to acquire a lock. Returns true if acquired, false if already held. */
  acquire(eventId: string, certificateType: string, ttlSeconds?: number): Promise<boolean>;
  /** Release a lock. Safe to call even if lock is not held. */
  release(eventId: string, certificateType: string): Promise<void>;
};

/**
 * Build the Redis key for a certificate operation lock.
 */
export function buildLockKey(eventId: string, certificateType: string): string {
  return `${LOCK_PREFIX}${eventId}:${certificateType}`;
}

/**
 * Create a distributed lock backed by Upstash Redis.
 */
export function createRedisLock(): DistributedLock {
  return {
    async acquire(eventId, certificateType, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS) {
      const redis = getRedisClient();
      const key = buildLockKey(eventId, certificateType);
      const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds });
      return result === 'OK';
    },

    async release(eventId, certificateType) {
      const redis = getRedisClient();
      const key = buildLockKey(eventId, certificateType);
      await redis.del(key);
    },
  };
}

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

/**
 * Create a distributed lock with an injected Redis client (for testing).
 */
export function createTestLock(redis: Redis): DistributedLock {
  return {
    async acquire(eventId, certificateType, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS) {
      const key = buildLockKey(eventId, certificateType);
      const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds });
      return result === 'OK';
    },

    async release(eventId, certificateType) {
      const key = buildLockKey(eventId, certificateType);
      await redis.del(key);
    },
  };
}

/**
 * Stub lock for testing — in-memory, no Redis needed.
 */
export function createStubLock(): DistributedLock & { locks: Set<string> } {
  const locks = new Set<string>();
  return {
    locks,
    async acquire(eventId, certificateType) {
      const key = buildLockKey(eventId, certificateType);
      if (locks.has(key)) return false;
      locks.add(key);
      return true;
    },
    async release(eventId, certificateType) {
      const key = buildLockKey(eventId, certificateType);
      locks.delete(key);
    },
  };
}
