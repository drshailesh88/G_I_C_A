import { Redis } from '@upstash/redis';

const PREFIX = 'test:sentry:events:';
const TTL_SECONDS = 3600;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL_TEST ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN_TEST ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export interface CapturedSentryEvent {
  id: string;
  kind: string | undefined;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  message: string | undefined;
  timestamp: string;
}

let counter = 0;

export async function captureSentryEvent(event: {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  message?: string;
}): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const id = `sentry-${Date.now()}-${++counter}`;
  const tags = event.tags ?? {};
  const record: CapturedSentryEvent = {
    id,
    kind: tags.kind,
    tags,
    extra: event.extra ?? {},
    message: event.message,
    timestamp: new Date().toISOString(),
  };

  await redis.set(`${PREFIX}${id}`, record, { ex: TTL_SECONDS });
}

export async function querySentryEvents(filters: {
  kind?: string;
  triggerId?: string;
  endpoint?: string;
  inngestEventId?: string;
}): Promise<CapturedSentryEvent[]> {
  const redis = getRedis();
  if (!redis) return [];

  const keys = await redis.keys(`${PREFIX}*`);
  if (keys.length === 0) return [];

  const events: CapturedSentryEvent[] = [];
  for (const key of keys) {
    const evt = await redis.get<CapturedSentryEvent>(key);
    if (!evt) continue;
    events.push(evt);
  }

  let filtered = events;

  if (filters.kind) {
    filtered = filtered.filter((e) => e.kind === filters.kind);
  }

  if (filters.triggerId) {
    filtered = filtered.filter(
      (e) => e.extra.triggerId === filters.triggerId || e.tags.triggerId === filters.triggerId,
    );
  }

  if (filters.endpoint) {
    filtered = filtered.filter(
      (e) => e.extra.endpoint === filters.endpoint || e.tags.endpoint === filters.endpoint,
    );
  }

  if (filters.inngestEventId) {
    filtered = filtered.filter(
      (e) =>
        e.extra.inngestEventId === filters.inngestEventId ||
        e.tags.inngestEventId === filters.inngestEventId ||
        e.tags.cascade_event === filters.inngestEventId,
    );
  }

  return filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
