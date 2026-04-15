import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { RegisterPageClient } from './register-page-client';

type Params = Promise<{ eventId: string }>;

export default async function RegisterByIdPage({
  params,
}: {
  params: Params;
}) {
  const { eventId } = await params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(eventId)) {
    notFound();
  }

  const [event] = await db
    .select({
      id: events.id,
      name: events.name,
      startDate: events.startDate,
      endDate: events.endDate,
      venueName: events.venueName,
      status: events.status,
      registrationSettings: events.registrationSettings,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    notFound();
  }

  if (event.status !== 'published') {
    notFound();
  }

  const regSettings = (event.registrationSettings as Record<string, unknown>) ?? {};
  const isOpen = regSettings.open !== false;

  return (
    <RegisterPageClient
      eventId={event.id}
      eventName={event.name}
      startDate={event.startDate ? event.startDate.toISOString() : null}
      endDate={event.endDate ? event.endDate.toISOString() : null}
      venueName={event.venueName}
      registrationOpen={isOpen}
    />
  );
}
