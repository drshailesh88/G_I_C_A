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
import type { Channel, ProviderName } from './types';

const DLQ_KEY = 'webhook:dlq';
const DLQ_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_POP_COUNT = 10;
const MAX_POP_COUNT = 100;

const VALID_PROVIDERS = new Set<ProviderName>(['resend', 'evolution_api', 'waba']);
const VALID_CHANNELS = new Set<Channel>(['email', 'whatsapp']);

export type DlqEntry = {
  provider: ProviderName;
  channel: Channel;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function isValidDlqEntry(value: unknown): value is DlqEntry {
  if (!isRecord(value)) return false;

  return (
    typeof value.provider === 'string' &&
    VALID_PROVIDERS.has(value.provider as ProviderName) &&
    typeof value.channel === 'string' &&
    VALID_CHANNELS.has(value.channel as Channel) &&
    typeof value.failedAt === 'string' &&
    isValidTimestamp(value.failedAt) &&
    typeof value.errorMessage === 'string' &&
    value.errorMessage.trim().length > 0 &&
    'rawPayload' in value
  );
}

function serializeDlqEntry(entry: DlqEntry): string | null {
  if (!isValidDlqEntry(entry)) {
    return null;
  }

  try {
    return JSON.stringify(entry);
  } catch {
    return null;
  }
}

function parseDlqEntry(raw: unknown): DlqEntry | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isValidDlqEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePopCount(count: number): number {
  if (!Number.isSafeInteger(count) || count <= 0) {
    return 0;
  }

  return Math.min(count, MAX_POP_COUNT);
}

/**
 * Push a failed webhook payload to the dead letter queue.
 * Best-effort — if Redis is also down, we log and accept the loss.
 */
export async function pushToDlq(entry: DlqEntry): Promise<boolean> {
  try {
    const serializedEntry = serializeDlqEntry(entry);
    if (!serializedEntry) {
      console.error('[webhook-dlq] Refusing to push malformed DLQ entry');
      return false;
    }

    const redis = getRedisClient();
    if (!redis) {
      console.error(
        '[webhook-dlq] Redis not configured — payload lost:',
        serializedEntry.slice(0, 200),
      );
      return false;
    }

    await redis.lpush(DLQ_KEY, serializedEntry);
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
export async function popFromDlq(count: number = DEFAULT_POP_COUNT): Promise<DlqEntry[]> {
  try {
    const redis = getRedisClient();
    if (!redis) return [];

    const normalizedCount = normalizePopCount(count);
    if (normalizedCount === 0) {
      console.error('[webhook-dlq] Refusing to pop DLQ entries with invalid count:', count);
      return [];
    }

    const entries: DlqEntry[] = [];
    for (let i = 0; i < normalizedCount; i++) {
      let raw: unknown;

      try {
        raw = await redis.rpop(DLQ_KEY);
      } catch (error) {
        console.error('[webhook-dlq] Failed to pop from DLQ:', error);
        break;
      }

      if (!raw) break;

      const parsedEntry = parseDlqEntry(raw);
      if (!parsedEntry) {
        console.error('[webhook-dlq] Dropping malformed DLQ entry during pop');
        continue;
      }

      entries.push(parsedEntry);
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
