import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { getEventBranding, getBrandingImageUrls } from '@/lib/actions/branding';
import { getEvent } from '@/lib/actions/event';
import { BrandingFormClient } from './branding-form-client';

type Params = Promise<{ eventId: string }>;

export default async function BrandingPage({
  params,
}: {
  params: Params;
}) {
  const { eventId } = await params;

  let role: string | null = null;
  try {
    ({ role } = await assertEventAccess(eventId));
  } catch {
    redirect('/login');
  }

  const [branding, imageUrls, event] = await Promise.all([
    getEventBranding(eventId),
    getBrandingImageUrls(eventId),
    getEvent(eventId),
  ]);
  const canWrite =
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.EVENT_COORDINATOR ||
    role === ROLES.OPS;

  return (
    <BrandingFormClient
      eventId={eventId}
      eventName={event.name}
      initialBranding={branding}
      initialImageUrls={imageUrls}
      canWriteOverride={canWrite}
    />
  );
}
