import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/actions/event';
import { FacultyConfirmedClient } from './faculty-confirmed-client';

type Params = Promise<{ eventSlug: string }>;

export default async function FacultyConfirmedPage({
  params,
}: {
  params: Params;
}) {
  const { eventSlug } = await params;

  let event;
  try {
    event = await getEventBySlug(eventSlug);
  } catch {
    notFound();
  }

  return <FacultyConfirmedClient event={event} />;
}
