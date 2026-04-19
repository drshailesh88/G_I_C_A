import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/actions/event';
import { getRegistrationPublic } from '@/lib/actions/registration';
import { RegistrationSuccessClient } from './registration-success-client';

type SearchParams = Promise<{ id?: string }>;
type Params = Promise<{ eventSlug: string }>;

export default async function RegistrationSuccessPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { eventSlug } = await params;
  const sp = await searchParams;

  if (!sp.id) notFound();

  let event;
  try {
    event = await getEventBySlug(eventSlug);
  } catch {
    notFound();
  }

  let registration;
  try {
    registration = await getRegistrationPublic(event.id, sp.id);
  } catch {
    notFound();
  }

  return (
    <RegistrationSuccessClient
      eventSlug={event.slug}
      registrationNumber={registration.registrationNumber}
      status={registration.status}
      showQr={registration.status === 'confirmed'}
    />
  );
}
