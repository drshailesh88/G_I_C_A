import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/actions/event';
import { getPublicProgramData } from '@/lib/actions/program';
import { PublicProgramClient } from './program-client';

type Params = Promise<{ eventSlug: string }>;
type SearchParams = Promise<{ d?: string }>;

export default async function PublicProgramPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { eventSlug } = await params;
  const { d } = await searchParams;

  let event;
  try {
    event = await getEventBySlug(eventSlug);
  } catch (err) {
    if (err instanceof Error && err.message === 'Event not found') {
      notFound();
    }
    throw err;
  }

  if (event.status !== 'published') {
    notFound();
  }

  const programData = await getPublicProgramData(event.id);

  if (!programData.hasPublishedVersion) {
    notFound();
  }

  return (
    <PublicProgramClient
      event={event}
      sessions={programData.sessions}
      halls={programData.halls}
      hasPublishedVersion={programData.hasPublishedVersion}
      initialDate={d ?? null}
    />
  );
}
