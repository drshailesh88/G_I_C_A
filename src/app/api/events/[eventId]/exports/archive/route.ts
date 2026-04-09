import { NextResponse } from 'next/server';
import { assertEventAccess } from '@/lib/auth/event-access';
import { inngest } from '@/lib/inngest/client';

type Params = Promise<{ eventId: string }>;

export async function POST(
  _request: Request,
  { params }: { params: Params },
) {
  const { eventId } = await params;

  // Auth check — read access is sufficient for archive download
  try {
    await assertEventAccess(eventId);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Dispatch to Inngest — archive generation runs as stepped background job
    const { ids } = await inngest.send({
      name: 'bulk/archive.generate',
      data: { eventId },
    });

    return NextResponse.json({
      queued: true,
      message: 'Archive generation queued. You will be notified when it is ready.',
      inngestEventId: ids?.[0] ?? null,
    });
  } catch (err) {
    console.error(`Archive generation dispatch failed for eventId=${eventId}:`, err);
    return NextResponse.json(
      { error: 'Failed to queue archive generation' },
      { status: 500 },
    );
  }
}
