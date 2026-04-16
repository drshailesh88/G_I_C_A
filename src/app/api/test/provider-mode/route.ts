import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { guard } from '../_guard';

const MODE_KEY_PREFIX = 'test:provider-mode:';
const ATTEMPTS_KEY_PREFIX = 'test:provider-mode-attempts:';

const stringModeSchema = z.union([
  z.literal('normal'),
  z.literal('fail'),
  z.string().regex(/^failN:\d+$/),
  z.string().regex(/^flaky:(?:0?\.\d+|[01])$/),
]);

const modeSchema = z.union([
  stringModeSchema,
  z.object({
    failN: z.number().int().nonnegative(),
  }),
  z.object({
    flaky: z.number().min(0).max(1),
  }),
]);

const bodySchema = z.object({
  channel: z.enum(['email', 'whatsapp']),
  mode: modeSchema,
});

function normalizeMode(mode: z.infer<typeof modeSchema>): string {
  if (typeof mode === 'string') {
    return mode;
  }

  if ('failN' in mode) {
    return `failN:${mode.failN}`;
  }

  return `flaky:${mode.flaky}`;
}

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

  const { channel } = parsed.data;
  const mode = normalizeMode(parsed.data.mode);
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
