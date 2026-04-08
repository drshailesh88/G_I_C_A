import { notFound } from 'next/navigation';
import { getFacultyInviteByToken } from '@/lib/actions/program';
import { getEventBySlug } from '@/lib/actions/event';
import { FacultyConfirmClient } from './faculty-confirm-client';

type Params = Promise<{ eventSlug: string; token: string }>;

export default async function FacultyConfirmPage({
  params,
}: {
  params: Params;
}) {
  const { eventSlug, token } = await params;

  let event;
  try {
    event = await getEventBySlug(eventSlug);
  } catch {
    notFound();
  }

  let invite;
  try {
    invite = await getFacultyInviteByToken(token);
  } catch {
    notFound();
  }

  // Verify invite belongs to this event
  if (invite.eventId !== event.id) {
    notFound();
  }

  return (
    <FacultyConfirmClient
      event={event}
      invite={invite}
      token={token}
      eventSlug={eventSlug}
    />
  );
}
