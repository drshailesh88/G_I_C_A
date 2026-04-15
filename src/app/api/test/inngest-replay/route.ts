import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';
import { getCapturedEvent } from '@/lib/inngest/captured-events';
import { guard } from '../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;

  const { eventId } = await req.json().catch(() => ({ eventId: null }));
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  }

  const captured = await getCapturedEvent(eventId);
  if (!captured) {
    return NextResponse.json({ error: 'event not found in capture store' }, { status: 404 });
  }

  await inngest.send({ id: captured.id, name: captured.name, data: captured.data });
  return NextResponse.json({ ok: true, replayed: { id: captured.id, name: captured.name } });
}
