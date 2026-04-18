import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEvent } from '@/lib/actions/event';
import { ROLES } from '@/lib/auth/roles';
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

  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  const isCoordinator = session.has?.({ role: ROLES.EVENT_COORDINATOR }) ?? false;
  const canWrite = isSuperAdmin || isCoordinator;

  return <FieldBuilderClient event={event} canWrite={canWrite} />;
}
