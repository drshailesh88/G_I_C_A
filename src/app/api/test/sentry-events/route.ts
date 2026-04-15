import { NextRequest, NextResponse } from 'next/server';
import { querySentryEvents } from '@/lib/sentry/captured-events';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;

  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') ?? undefined;
  const triggerId = url.searchParams.get('triggerId') ?? undefined;
  const endpoint = url.searchParams.get('endpoint') ?? undefined;
  const inngestEventId = url.searchParams.get('inngestEventId') ?? undefined;

  const events = await querySentryEvents({ kind, triggerId, endpoint, inngestEventId });
  return NextResponse.json({ events, count: events.length });
}
