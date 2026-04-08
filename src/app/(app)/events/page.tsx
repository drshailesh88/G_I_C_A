import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEvents } from '@/lib/actions/event';
import { EventsListClient } from './events-list-client';

export default async function EventsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const events = await getEvents();

  return <EventsListClient events={events} />;
}
