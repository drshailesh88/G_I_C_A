import { Redis } from '@upstash/redis';

const EVENTS_PREFIX = 'test:inngest:events:';
const ATTEMPTS_PREFIX = 'test:inngest:attempts:';
const TTL_SECONDS = 3600;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL_TEST ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN_TEST ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

interface CapturedEvent {
  id: string;
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface AttemptRecord {
  count: number;
  lastStatus: string;
}

export async function captureInngestEvent(event: {
  id: string;
  name: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const record: CapturedEvent = {
    id: event.id,
    name: event.name,
    data: event.data,
    timestamp: new Date().toISOString(),
  };

  await redis.set(`${EVENTS_PREFIX}${event.id}`, record, { ex: TTL_SECONDS });
}

export async function getCapturedEvent(eventId: string): Promise<CapturedEvent | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get<CapturedEvent>(`${EVENTS_PREFIX}${eventId}`);
}

export async function queryCapturedEvents(filters: {
  name?: string;
  triggerId?: string;
  windowMs?: number;
}): Promise<CapturedEvent[]> {
  const redis = getRedis();
  if (!redis) return [];

  const keys = await redis.keys(`${EVENTS_PREFIX}*`);
  if (keys.length === 0) return [];

  const events: CapturedEvent[] = [];
  for (const key of keys) {
    const evt = await redis.get<CapturedEvent>(key);
    if (!evt) continue;
    events.push(evt);
  }

  let filtered = events;

  if (filters.name) {
    filtered = filtered.filter((e) => e.name === filters.name);
  }

  if (filters.triggerId) {
    filtered = filtered.filter((e) => {
      const data = e.data as Record<string, unknown>;
      const payload = data.payload as Record<string, unknown> | undefined;
      return (
        data.triggerId === filters.triggerId ||
        (payload && payload.triggerId === filters.triggerId)
      );
    });
  }

  if (filters.windowMs) {
    const cutoff = Date.now() - filters.windowMs;
    filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  }

  return filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function recordInngestAttempt(
  inngestEventId: string,
  status: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const count = await redis.incr(`${ATTEMPTS_PREFIX}${inngestEventId}:counter`);
  await redis.set(
    `${ATTEMPTS_PREFIX}${inngestEventId}`,
    { count, lastStatus: status } satisfies AttemptRecord,
    { ex: TTL_SECONDS },
  );
  await redis.expire(`${ATTEMPTS_PREFIX}${inngestEventId}:counter`, TTL_SECONDS);
}

export async function getInngestAttemptCount(
  inngestEventId: string,
): Promise<AttemptRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get<AttemptRecord>(`${ATTEMPTS_PREFIX}${inngestEventId}`);
}
