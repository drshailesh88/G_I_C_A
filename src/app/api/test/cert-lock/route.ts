import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { guard } from '../_guard';

function testRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL_TEST;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
  return url && token ? new Redis({ url, token }) : null;
}

function lockKey(eventId: string, type: string) {
  return `lock:certificates:generate:${eventId}:${type}`;
}

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const eventId = p.get('event_id'); const type = p.get('type');
  if (!eventId || !type) return NextResponse.json({ error: 'event_id and type required' }, { status: 400 });
  const r = testRedis(); if (!r) return NextResponse.json({ error: 'upstash not configured' }, { status: 500 });
  const key = lockKey(eventId, type);
  const value = await r.get(key);
  const ttl = await r.ttl(key);
  return NextResponse.json({ key, held: value !== null, value, ttl });
}

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const body = await req.json();
  const { event_id, type, lock_holder, ttl_seconds } = body;
  if (!event_id || !type) return NextResponse.json({ error: 'event_id and type required' }, { status: 400 });
  const r = testRedis(); if (!r) return NextResponse.json({ error: 'upstash not configured' }, { status: 500 });
  const key = lockKey(event_id, type);
  const payload = { lock_holder: lock_holder ?? 'test', started_at: new Date().toISOString() };
  await r.set(key, JSON.stringify(payload), { ex: Number(ttl_seconds ?? 300) });
  return NextResponse.json({ ok: true, key, ttl: Number(ttl_seconds ?? 300) });
}

export async function DELETE(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const eventId = p.get('event_id'); const type = p.get('type');
  if (!eventId || !type) return NextResponse.json({ error: 'event_id and type required' }, { status: 400 });
  const r = testRedis(); if (!r) return NextResponse.json({ error: 'upstash not configured' }, { status: 500 });
  await r.del(lockKey(eventId, type));
  return NextResponse.json({ ok: true });
}
