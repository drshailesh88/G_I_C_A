import { Redis } from '@upstash/redis';

const BULK_GENERATION_SUMMARY_PREFIX = 'certificates:bulk:summary:';
const BULK_GENERATION_SUMMARY_TTL_SECONDS = 60 * 60 * 24;

export type BulkCertificateGenerationSummary = {
  batch_id: string;
  event_id: string;
  status: 'completed' | 'failed';
  total: number;
  issued: number;
  skipped: number;
  certificate_ids: string[];
  errors: string[];
  completed_at: string;
};

export function buildBulkGenerationSummaryKey(eventId: string, batchId: string): string {
  return `${BULK_GENERATION_SUMMARY_PREFIX}${eventId}:${batchId}`;
}

function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.UPSTASH_REDIS_REST_URL_TEST;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
  if (!url && !token && process.env.NODE_ENV === 'test') {
    return { url: 'https://redis.test', token: 'test-token' };
  }
  return url && token ? { url, token } : null;
}

export function createBulkGenerationRedisClient(): Redis | null {
  const credentials = redisCredentials();
  return credentials ? new Redis(credentials) : null;
}

export async function writeBulkCertificateGenerationSummary(
  summary: BulkCertificateGenerationSummary,
): Promise<boolean> {
  const redis = createBulkGenerationRedisClient();
  if (!redis) {
    console.error('Bulk certificate generation summary was not stored because Redis is not configured');
    return false;
  }

  try {
    await redis.set(buildBulkGenerationSummaryKey(summary.event_id, summary.batch_id), summary, {
      ex: BULK_GENERATION_SUMMARY_TTL_SECONDS,
    });
    return true;
  } catch (err) {
    console.error(`Failed to store bulk certificate generation summary ${summary.batch_id}:`, err);
    return false;
  }
}

export async function readBulkCertificateGenerationSummary(
  eventId: string,
  batchId: string,
): Promise<BulkCertificateGenerationSummary | null> {
  const redis = createBulkGenerationRedisClient();
  if (!redis) {
    throw new Error('Redis not configured');
  }

  const summary = await redis.get<BulkCertificateGenerationSummary | string>(
    buildBulkGenerationSummaryKey(eventId, batchId),
  );
  if (!summary) return null;
  if (typeof summary === 'string') {
    return JSON.parse(summary) as BulkCertificateGenerationSummary;
  }
  return summary;
}
