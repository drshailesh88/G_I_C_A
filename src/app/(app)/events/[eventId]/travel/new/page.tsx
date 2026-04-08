import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { searchPeople } from '@/lib/actions/person';
import { TravelFormClient } from '../travel-form-client';

type Params = Promise<{ eventId: string }>;

export default async function NewTravelPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;

  // Fetch all people for the picker (first page, generous limit)
  const result = await searchPeople({ view: 'all', limit: 200, page: 1 });

  return (
    <TravelFormClient
      eventId={eventId}
      people={result.people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        phoneE164: p.phoneE164,
      }))}
    />
  );
}
