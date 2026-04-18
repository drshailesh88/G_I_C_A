import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getPerson, getPersonHistory, type PersonHistoryResult } from '@/lib/actions/person';
import { PersonDetailClient } from './person-detail-client';

type Params = Promise<{ personId: string }>;

const EMPTY_HISTORY: PersonHistoryResult = { rows: [], total: 0, page: 1, totalPages: 0 };

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
    if (err instanceof Error && (err.message === 'Person not found' || err.message.includes('Invalid person ID'))) {
      notFound();
    }
    throw err;
  }

  const initialHistory = await getPersonHistory(personId, 1).catch(() => EMPTY_HISTORY);

  return <PersonDetailClient person={person} initialHistory={initialHistory} />;
}
