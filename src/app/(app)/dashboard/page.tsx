import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEvents } from '@/lib/actions/event';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const eventList = await getEvents();

  const eventsForSelector = eventList.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status as string,
    startDate: e.startDate instanceof Date ? e.startDate.toISOString() : String(e.startDate),
  }));

  return <DashboardClient events={eventsForSelector} />;
}
