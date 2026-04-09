import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
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

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  const [branding, imageUrls, event] = await Promise.all([
    getEventBranding(eventId),
    getBrandingImageUrls(eventId),
    getEvent(eventId),
  ]);

  return (
    <BrandingFormClient
      eventId={eventId}
      eventName={event.name}
      initialBranding={branding}
      initialImageUrls={imageUrls}
    />
  );
}
