import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { guard } from '../_guard';

function testRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL_TEST ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN_TEST ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const key = new URL(req.url).searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  const r = testRedis();
  if (!r) return NextResponse.json({ error: 'upstash not configured' }, { status: 500 });
  const value = await r.get(key);
  const ttl = await r.ttl(key);
  return NextResponse.json({ key, value, ttl });
}
