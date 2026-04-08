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
  } catch {
    notFound();
  }

  return <PersonDetailClient person={person} />;
}
