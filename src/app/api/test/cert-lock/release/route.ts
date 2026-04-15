import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { guard } from '../../_guard';

export async function DELETE(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const eventId = p.get('event_id'); const type = p.get('type');
  if (!eventId || !type) return NextResponse.json({ error: 'event_id and type required' }, { status: 400 });
  const url = process.env.UPSTASH_REDIS_REST_URL_TEST;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
  if (!url || !token) return NextResponse.json({ error: 'upstash not configured' }, { status: 500 });
  const r = new Redis({ url, token });
  await r.del(`lock:certificates:generate:${eventId}:${type}`);
  return NextResponse.json({ ok: true });
}
