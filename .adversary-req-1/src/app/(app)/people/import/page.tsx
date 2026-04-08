import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CsvImportClient } from './csv-import-client';

export default async function CsvImportPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  return <CsvImportClient />;
}
