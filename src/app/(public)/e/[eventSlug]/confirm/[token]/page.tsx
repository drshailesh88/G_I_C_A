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

  // Strip sensitive token from invite before passing to client
  const safeInvite = {
    id: invite.id,
    eventId: invite.eventId,
    personId: invite.personId,
    status: invite.status,
    sentAt: invite.sentAt,
    respondedAt: invite.respondedAt,
  };

  return (
    <FacultyConfirmClient
      event={event}
      invite={safeInvite}
      token={token}
      eventSlug={eventSlug}
    />
  );
}
