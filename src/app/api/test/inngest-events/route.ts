import { NextRequest, NextResponse } from 'next/server';
import { queryCapturedEvents } from '@/lib/inngest/captured-events';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;

  const url = new URL(req.url);
  const name = url.searchParams.get('name') ?? undefined;
  const triggerId = url.searchParams.get('triggerId') ?? undefined;
  const windowParam = url.searchParams.get('window');
  const windowMs = windowParam ? parseInt(windowParam, 10) : undefined;

  const events = await queryCapturedEvents({ name, triggerId, windowMs });
  return NextResponse.json({ events, count: events.length });
}
