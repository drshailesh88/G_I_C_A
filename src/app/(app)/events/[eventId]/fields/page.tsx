import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEvent } from '@/lib/actions/event';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasAnyRole } from '@/lib/auth/session-role';
import { FieldBuilderClient } from './field-builder-client';

export default async function FieldBuilderPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/login');

  const { eventId } = await params;
  const event = await getEvent(eventId);

  const canWrite = sessionHasAnyRole(session, [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR]);

  return <FieldBuilderClient event={event} canWrite={canWrite} />;
}
