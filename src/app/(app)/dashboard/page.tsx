import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEvents } from '@/lib/actions/event';
import { getAppRoleFromSession } from '@/lib/auth/session-role';
import { DashboardClient } from './dashboard-client';
import { NoRoleNotice } from './no-role-notice';

export default async function DashboardPage() {
  const session = await auth();
  if (!session.userId) redirect('/login');

  if (!getAppRoleFromSession(session)) {
    return <NoRoleNotice />;
  }

  const eventList = await getEvents();

  const eventsForSelector = eventList.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status as string,
    startDate: e.startDate instanceof Date ? e.startDate.toISOString() : String(e.startDate),
  }));

  return <DashboardClient events={eventsForSelector} />;
}
