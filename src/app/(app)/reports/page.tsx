import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { ROLES } from '@/lib/auth/roles';
import { getEventsForGlobalReports } from '@/lib/actions/reports';
import { GlobalReportsClient } from './global-reports-client';

export default async function GlobalReportsPage() {
  const session = await auth();
  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;

  if (!isSuperAdmin) {
    redirect('/dashboard');
  }

  const result = await getEventsForGlobalReports();
  const eventList = result.ok ? result.events : [];

  return <GlobalReportsClient events={eventList} />;
}
