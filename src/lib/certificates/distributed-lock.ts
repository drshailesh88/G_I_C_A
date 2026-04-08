/**
 * Distributed Lock for Certificate Operations
 *
 * Uses @upstash/redis SET NX EX with owner tokens to prevent simultaneous
 * bulk operations for the same event/certificate type combination.
 *
 * Lock key: cert:lock:{eventId}:{certificateType}
 * Lock value: owner token (UUID) — prevents cross-process lock theft
 * Default TTL: 10 minutes (auto-release safety net for long bulk operations)
 *
 * Release uses conditional deletion (only deletes if owner token matches)
 * to prevent a process from accidentally deleting another process's lock
 * after TTL-based expiry + re-acquisition by a second process.
 */

import { Redis } from '@upstash/redis';

const LOCK_PREFIX = 'cert:lock:';
const DEFAULT_LOCK_TTL_SECONDS = 600; // 10 minutes

export type LockHandle = {
  key: string;
  ownerToken: string;
};

export type DistributedLock = {
  /** Acquire a lock. Returns a LockHandle if acquired, null if already held. */
  acquire(eventId: string, certificateType: string, ttlSeconds?: number): Promise<LockHandle | null>;
  /** Release a lock. Only releases if the ownerToken matches. Safe to call even if expired. */
  release(handle: LockHandle): Promise<void>;
};

/**
 * Build the Redis key for a certificate operation lock.
 */
export function buildLockKey(eventId: string, certificateType: string): string {
  if (!eventId || !certificateType) {
    throw new Error('eventId and certificateType are required for lock key');
  }
  return `${LOCK_PREFIX}${eventId}:${certificateType}`;
}

/**
 * Lua script for atomic compare-and-delete.
 * Only deletes the key if its value matches the provided owner token.
 * Returns 1 if deleted, 0 if not (wrong owner or expired).
 */
const RELEASE_LUA = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;

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
 * Create a distributed lock backed by Upstash Redis.
 */
export function createRedisLock(): DistributedLock {
  return {
    async acquire(eventId, certificateType, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS) {
      const redis = getRedisClient();
      const key = buildLockKey(eventId, certificateType);
      const ownerToken = crypto.randomUUID();
      const result = await redis.set(key, ownerToken, { nx: true, ex: ttlSeconds });
      if (result === 'OK') {
        return { key, ownerToken };
      }
      return null;
    },

    async release(handle) {
      const redis = getRedisClient();
      await redis.eval(RELEASE_LUA, [handle.key], [handle.ownerToken]);
    },
  };
}

/**
 * Create a distributed lock with an injected Redis client (for testing).
 */
export function createTestLock(redis: Redis): DistributedLock {
  return {
    async acquire(eventId, certificateType, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS) {
      const key = buildLockKey(eventId, certificateType);
      const ownerToken = crypto.randomUUID();
      const result = await redis.set(key, ownerToken, { nx: true, ex: ttlSeconds });
      if (result === 'OK') {
        return { key, ownerToken };
      }
      return null;
    },

    async release(handle) {
      await redis.eval(RELEASE_LUA, [handle.key], [handle.ownerToken]);
    },
  };
}

/**
 * Stub lock for testing — in-memory, no Redis needed.
 * Tracks owner tokens to simulate conditional release.
 */
export function createStubLock(): DistributedLock & { locks: Map<string, string> } {
  const locks = new Map<string, string>();
  return {
    locks,
    async acquire(eventId, certificateType) {
      const key = buildLockKey(eventId, certificateType);
      if (locks.has(key)) return null;
      const ownerToken = crypto.randomUUID();
      locks.set(key, ownerToken);
      return { key, ownerToken };
    },
    async release(handle) {
      const current = locks.get(handle.key);
      if (current === handle.ownerToken) {
        locks.delete(handle.key);
      }
      // If owner doesn't match (lock expired + re-acquired), do nothing
    },
  };
}
