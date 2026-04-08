import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getPublicScheduleData } from '@/lib/actions/program';
import { getEvents } from '@/lib/actions/event';
import { AttendeeProgram } from './attendee-program-client';

type SearchParams = Promise<{ eventId?: string }>;

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const resolvedParams = await searchParams;

  // If eventId is provided, use it; otherwise pick the first published event
  let eventId = resolvedParams.eventId;

  if (!eventId) {
    const events = await getEvents();
    const published = events.find((e) => e.status === 'published');
    eventId = published?.id ?? events[0]?.id;
  }

  if (!eventId) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <p className="font-medium text-text-primary">No events found</p>
        <p className="mt-1 text-sm text-text-secondary">
          Create an event first, then come back to view the program.
        </p>
      </div>
    );
  }

  const data = await getPublicScheduleData(eventId);

  return (
    <AttendeeProgram
      eventId={eventId}
      sessions={data.sessions}
      halls={data.halls}
    />
  );
}
