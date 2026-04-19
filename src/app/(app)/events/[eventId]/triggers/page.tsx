import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { getTriggersForEvent, getTemplatesHub } from '@/lib/actions/notifications';
import { TriggersClient } from '../templates/triggers/triggers-client';

const COMMUNICATIONS_WRITE_ROLES = new Set<string>([ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR]);

export default async function TriggersPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  let role: string | null | undefined;
  try {
    const access = await assertEventAccess(eventId);
    role = access.role;
  } catch {
    redirect(`/events/${eventId}`);
  }

  const canWrite = !!role && COMMUNICATIONS_WRITE_ROLES.has(role);

  const [triggers, templates] = await Promise.all([
    getTriggersForEvent({ eventId }),
    getTemplatesHub({ eventId }),
  ]);

  const allTemplates = [...templates.eventTemplates, ...templates.globalTemplates];

  return (
    <TriggersClient
      eventId={eventId}
      triggers={triggers}
      templates={allTemplates}
      canWrite={canWrite}
    />
  );
}
