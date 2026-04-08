/**
 * Webhook Dead Letter Queue
 *
 * When webhook processing fails (DB outage, etc.), we push the raw
 * payload to a Redis list so it can be retried later. This prevents
 * permanent data loss when we return 200 to the provider.
 *
 * Uses @upstash/redis (already installed for idempotency).
 */

import { Redis } from '@upstash/redis';

const DLQ_KEY = 'webhook:dlq';
const DLQ_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type DlqEntry = {
  provider: string;
  channel: 'email' | 'whatsapp';
  rawPayload: unknown;
  failedAt: string;
  errorMessage: string;
};

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Push a failed webhook payload to the dead letter queue.
 * Best-effort — if Redis is also down, we log and accept the loss.
 */
export async function pushToDlq(entry: DlqEntry): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) {
      console.error('[webhook-dlq] Redis not configured — payload lost:', JSON.stringify(entry).slice(0, 200));
      return false;
    }

    await redis.lpush(DLQ_KEY, JSON.stringify(entry));
    // Set TTL on the list to auto-expire after 7 days
    await redis.expire(DLQ_KEY, DLQ_TTL_SECONDS);
    return true;
  } catch (error) {
    console.error('[webhook-dlq] Failed to push to DLQ:', error);
    return false;
  }
}

/**
 * Pop entries from the DLQ for reprocessing.
 * Returns up to `count` entries (oldest first).
 */
export async function popFromDlq(count: number = 10): Promise<DlqEntry[]> {
  try {
    const redis = getRedisClient();
    if (!redis) return [];

    const entries: DlqEntry[] = [];
    for (let i = 0; i < count; i++) {
      const raw = await redis.rpop(DLQ_KEY);
      if (!raw) break;
      entries.push(typeof raw === 'string' ? JSON.parse(raw) : raw as DlqEntry);
    }
    return entries;
  } catch (error) {
    console.error('[webhook-dlq] Failed to pop from DLQ:', error);
    return [];
  }
}

/**
 * Get the current DLQ size (for monitoring).
 */
export async function getDlqSize(): Promise<number> {
  try {
    const redis = getRedisClient();
    if (!redis) return 0;
    return await redis.llen(DLQ_KEY);
  } catch {
    return 0;
  }
}
