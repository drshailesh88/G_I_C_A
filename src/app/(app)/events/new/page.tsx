import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CreateEventForm } from './create-event-form';

export default async function CreateEventPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  return <CreateEventForm />;
}
