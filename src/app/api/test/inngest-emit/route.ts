import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';
import { captureInngestEvent } from '@/lib/inngest/captured-events';
import { guard } from '../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { name, payload } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const id = crypto.randomUUID();
  const data = payload ?? {};
  await inngest.send({ id, name, data });
  await captureInngestEvent({ id, name, data }).catch(() => {});
  return NextResponse.json({ ok: true, eventId: id });
}
