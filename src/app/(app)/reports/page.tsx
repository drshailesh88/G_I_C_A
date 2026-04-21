import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasRole } from '@/lib/auth/session-role';
import { getEventsForGlobalReports } from '@/lib/actions/reports';
import { GlobalReportsClient } from './global-reports-client';

type SearchParams = Promise<{ eventId?: string }>;

export default async function GlobalReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!sessionHasRole(session, ROLES.SUPER_ADMIN)) {
    redirect('/dashboard');
  }

  const { eventId } = await searchParams;
  const result = await getEventsForGlobalReports();
  const eventList = result.ok ? result.events : [];

  return <GlobalReportsClient events={eventList} initialEventId={eventId} />;
}
