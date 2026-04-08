import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { MoreMenuClient } from './more-menu-client';

export default async function MorePage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  return <MoreMenuClient />;
}
