import { RegistrationSuccessClient } from './registration-success-client';

type SearchParams = Promise<{
  regNumber?: string;
  qrToken?: string;
  status?: string;
}>;

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

  return (
    <RegistrationSuccessClient
      eventSlug={eventSlug}
      registrationNumber={sp.regNumber || ''}
      qrToken={sp.qrToken || ''}
      status={sp.status || 'confirmed'}
    />
  );
}
