import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { eventPeople } from '@/lib/db/schema/event-people';
import { issuedCertificates as certificates } from '@/lib/db/schema/certificates';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { travelRecords, accommodationRecords } from '@/lib/db/schema/logistics';
import { sessions } from '@/lib/db/schema/program';
import { redFlags } from '@/lib/db/schema/red-flags';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const eventId = new URL(req.url).searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  const bundle = {
    event_people: await db.select().from(eventPeople).where(eq(eventPeople.eventId, eventId)),
    registrations: await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, eventId)),
    travel: await db.select().from(travelRecords).where(eq(travelRecords.eventId, eventId)),
    accommodation: await db.select().from(accommodationRecords).where(eq(accommodationRecords.eventId, eventId)),
    sessions: await db.select().from(sessions).where(eq(sessions.eventId, eventId)),
    certificates: await db.select().from(certificates).where(eq(certificates.eventId, eventId)),
    red_flags: await db.select().from(redFlags).where(eq(redFlags.eventId, eventId)),
  };
  const checksum = createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
  return NextResponse.json({ checksum, counts: Object.fromEntries(Object.entries(bundle).map(([k, v]) => [k, (v as any[]).length])) });
}
