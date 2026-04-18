import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { TravelImportClient } from './travel-import-client';

type Params = Promise<{ eventId: string }>;

export default async function TravelImportPage({ params }: { params: Params }) {
  const { eventId } = await params;

  let role: string | null = null;
  try {
    const access = await assertEventAccess(eventId);
    role = access.role ?? null;
  } catch {
    redirect('/login');
  }

  const writeRoles = new Set<string>([ROLES.SUPER_ADMIN, ROLES.OPS]);
  if (!role || !writeRoles.has(role)) {
    redirect(`/events/${eventId}/travel`);
  }

  return <TravelImportClient eventId={eventId} />;
}
