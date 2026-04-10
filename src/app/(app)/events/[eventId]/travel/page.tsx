import { redirect } from 'next/navigation';
import { eq, and, ne, sql } from 'drizzle-orm';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getEventTravelRecords } from '@/lib/actions/travel';
import { db } from '@/lib/db';
import { redFlags } from '@/lib/db/schema';
import { TravelListClient } from './travel-list-client';

type Params = Promise<{ eventId: string }>;

export default async function TravelPage({
  params,
}: {
  params: Params;
}) {
  const { eventId } = await params;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  const [records, flagCounts] = await Promise.all([
    getEventTravelRecords(eventId),
    db
      .select({
        sourceEntityId: redFlags.sourceEntityId,
        count: sql<number>`count(*)::int`,
      })
      .from(redFlags)
      .where(
        and(
          eq(redFlags.eventId, eventId),
          eq(redFlags.sourceEntityType, 'travel_record'),
          ne(redFlags.flagStatus, 'resolved'),
        )
      )
      .groupBy(redFlags.sourceEntityId),
  ]);

  const flagMap = new Map(flagCounts.map((r) => [r.sourceEntityId, r.count]));
  const recordsWithFlags = records.map((r) => ({
    ...r,
    flagCount: flagMap.get(r.id) ?? 0,
  }));

  return <TravelListClient eventId={eventId} records={recordsWithFlags} />;
}
