import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getProgramVersions } from '@/lib/actions/program';
import { ChangesClient } from './changes-client';

type Params = Promise<{ eventId: string }>;

export default async function ChangesPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session.userId) redirect('/login');

  const { eventId } = await params;
  const versions = await getProgramVersions(eventId);

  return <ChangesClient eventId={eventId} versions={versions} />;
}
