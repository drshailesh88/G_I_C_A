import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ImportSuccessClient } from './import-success-client';

type SearchParams = Promise<{
  total?: string;
  imported?: string;
  duplicates?: string;
  errors?: string;
}>;

export default async function ImportSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const params = await searchParams;

  return (
    <ImportSuccessClient
      total={parseInt(params.total || '0', 10)}
      imported={parseInt(params.imported || '0', 10)}
      duplicates={parseInt(params.duplicates || '0', 10)}
      errors={parseInt(params.errors || '0', 10)}
    />
  );
}
