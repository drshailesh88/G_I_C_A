import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getPerson } from '@/lib/actions/person';
import { PersonDetailClient } from './person-detail-client';

type Params = Promise<{ personId: string }>;

export default async function PersonDetailPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { personId } = await params;

  let person;
  try {
    person = await getPerson(personId);
  } catch (err) {
    // Only treat "not found" errors as 404; re-throw others for error boundary
    if (err instanceof Error && (err.message === 'Person not found' || err.message.includes('Invalid person ID'))) {
      notFound();
    }
    throw err;
  }

  return <PersonDetailClient person={person} />;
}
