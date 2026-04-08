import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { searchPeople } from '@/lib/actions/person';
import { PeopleListClient } from './people-list-client';

type SearchParams = Promise<{
  q?: string;
  view?: string;
  org?: string;
  city?: string;
  specialty?: string;
  tag?: string;
  page?: string;
}>;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const params = await searchParams;

  const result = await searchPeople({
    query: params.q || undefined,
    view: (params.view as 'all' | 'faculty' | 'delegates' | 'sponsors' | 'vips' | 'recent') || 'all',
    organization: params.org || undefined,
    city: params.city || undefined,
    specialty: params.specialty || undefined,
    tag: params.tag || undefined,
    page: params.page ? Number(params.page) || 1 : 1,
    limit: 25,
  });

  return (
    <PeopleListClient
      people={result.people}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      currentView={params.view || 'all'}
      currentQuery={params.q || ''}
    />
  );
}
