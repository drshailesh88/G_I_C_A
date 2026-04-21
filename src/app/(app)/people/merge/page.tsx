import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasAnyRole } from '@/lib/auth/session-role';
import { getPerson } from '@/lib/actions/person';
import { MergeClient } from './merge-client';

export default async function MergePeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const canWrite = sessionHasAnyRole(session, [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR]);

  if (!canWrite) redirect('/people');

  const { a, b } = await searchParams;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const aValid = a && UUID_RE.test(a);
  const bValid = b && UUID_RE.test(b);

  let personA = null;
  let personB = null;

  if (aValid) {
    try { personA = await getPerson(a); } catch { /* not found */ }
  }
  if (bValid) {
    try { personB = await getPerson(b); } catch { /* not found */ }
  }

  return <MergeClient personA={personA} personB={personB} />;
}
