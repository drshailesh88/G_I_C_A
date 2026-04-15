import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { guard } from '../_guard';

// Relies on the provider-mode shim (Phase 2c) recording sent bodies in Redis
// under key `test:last-sent:{triggerId}:{channel}`. Until the shim ships,
// returns { body: null }.
export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const triggerId = p.get('triggerId'); const channel = p.get('channel') ?? 'email';
  if (!triggerId) return NextResponse.json({ error: 'triggerId required' }, { status: 400 });
  const url = process.env.UPSTASH_REDIS_REST_URL_TEST;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
  if (!url || !token) return NextResponse.json({ body: null });
  const r = new Redis({ url, token });
  const body = await r.get<string>(`test:last-sent:${triggerId}:${channel}`);
  return NextResponse.json({ body });
}
