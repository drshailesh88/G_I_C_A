import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getEvent } from '@/lib/actions/event';
import { EventWorkspaceClient } from './event-workspace-client';

export default async function EventWorkspacePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;

  try {
    const event = await getEvent(eventId);
    return <EventWorkspaceClient event={event} />;
  } catch {
    notFound();
  }
}
