import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { guard } from '../_guard';

const MODE_KEY_PREFIX = 'test:provider-mode:';
const ATTEMPTS_KEY_PREFIX = 'test:provider-mode-attempts:';

const bodySchema = z.object({
  channel: z.enum(['email', 'whatsapp']),
  mode: z.union([
    z.literal('normal'),
    z.literal('fail'),
    z.string().regex(/^failN:\d+$/),
    z.string().regex(/^flaky:0?\.\d+$|^flaky:[01]$/),
  ]),
});

export async function POST(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { channel, mode } = parsed.data;
  const url =
    process.env.UPSTASH_REDIS_REST_URL_TEST ??
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN_TEST ??
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return NextResponse.json(
      { error: 'Redis not configured' },
      { status: 503 },
    );
  }

  const redis = new Redis({ url, token });
  await redis.set(`${MODE_KEY_PREFIX}${channel}`, mode, { ex: 3600 });
  await redis.del(`${ATTEMPTS_KEY_PREFIX}${channel}`);

  return NextResponse.json({ channel, mode, status: 'set' });
}
