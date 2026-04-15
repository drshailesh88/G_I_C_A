import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { guard } from '../../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { event_id, type, lock_holder, ttl_seconds } = await req.json();
  if (!event_id || !type) return NextResponse.json({ error: 'event_id and type required' }, { status: 400 });
  const url = process.env.UPSTASH_REDIS_REST_URL_TEST;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
  if (!url || !token) return NextResponse.json({ error: 'upstash not configured' }, { status: 500 });
  const r = new Redis({ url, token });
  const key = `lock:certificates:generate:${event_id}:${type}`;
  await r.set(key, JSON.stringify({ lock_holder: lock_holder ?? 'test', started_at: new Date().toISOString() }), {
    ex: Number(ttl_seconds ?? 300),
  });
  return NextResponse.json({ ok: true, key });
}
