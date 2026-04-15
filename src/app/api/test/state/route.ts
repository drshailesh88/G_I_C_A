import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { events } from '@/lib/db/schema/events';
import { eventPeople } from '@/lib/db/schema/event-people';
import { issuedCertificates as certificates, certificateTemplates } from '@/lib/db/schema/certificates';
import { eventRegistrations as registrations } from '@/lib/db/schema/registrations';
import { travelRecords } from '@/lib/db/schema/logistics';
import { accommodationRecords } from '@/lib/db/schema/logistics';
import { sessions } from '@/lib/db/schema/program';
import { redFlags } from '@/lib/db/schema/red-flags';
import { guard } from '../_guard';

const TABLES: Record<string, { table: any; eventIdCol: string; pkCol?: string }> = {
  events: { table: events, eventIdCol: 'id', pkCol: 'id' },
  delegates: { table: registrations, eventIdCol: 'eventId' },
  registrations: { table: registrations, eventIdCol: 'eventId' },
  event_people: { table: eventPeople, eventIdCol: 'eventId' },
  travel_records: { table: travelRecords, eventIdCol: 'eventId' },
  accommodation_records: { table: accommodationRecords, eventIdCol: 'eventId' },
  sessions: { table: sessions, eventIdCol: 'eventId' },
  certificates: { table: certificates, eventIdCol: 'eventId' },
  certificate_templates: { table: certificateTemplates, eventIdCol: 'eventId' },
  red_flags: { table: redFlags, eventIdCol: 'eventId' },
};

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const url = new URL(req.url);
  const entity = url.searchParams.get('entity');
  const eventId = url.searchParams.get('eventId');
  const id = url.searchParams.get('id');
  if (!entity) return NextResponse.json({ error: 'entity required' }, { status: 400 });
  const spec = TABLES[entity];
  if (!spec) return NextResponse.json({ error: `unknown entity: ${entity}` }, { status: 400 });
  const conds = [] as any[];
  if (eventId) conds.push(eq(spec.table[spec.eventIdCol], eventId));
  if (id && 'id' in spec.table) conds.push(eq(spec.table.id, id));
  const q = conds.length ? db.select().from(spec.table).where(and(...conds)) : db.select().from(spec.table);
  const rows = await q;
  // If a specific id was requested, return single object
  if (id) return NextResponse.json(rows[0] ?? null);
  return NextResponse.json(rows);
}
