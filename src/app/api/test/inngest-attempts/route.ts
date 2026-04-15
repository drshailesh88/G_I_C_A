import { NextRequest, NextResponse } from 'next/server';
import { getInngestAttemptCount } from '@/lib/inngest/captured-events';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;

  const eventId = new URL(req.url).searchParams.get('eventId');
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  }

  const record = await getInngestAttemptCount(eventId);
  return NextResponse.json({
    eventId,
    count: record?.count ?? 0,
    lastStatus: record?.lastStatus ?? null,
  });
}
