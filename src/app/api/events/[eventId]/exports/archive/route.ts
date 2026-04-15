import { NextResponse } from 'next/server';
import { assertEventAccess, EventNotFoundError } from '@/lib/auth/event-access';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { generateEventArchive } from '@/lib/exports/archive';
import { createR2Provider } from '@/lib/certificates/storage';
import { z } from 'zod';

type Params = Promise<{ eventId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
});

export async function POST(
  _request: Request,
  { params }: { params: Params },
) {
  const { eventId: rawEventId } = await params;

  // Validate eventId
  const parsed = paramsSchema.safeParse({ eventId: rawEventId });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }
  const { eventId } = parsed.data;

  // Auth check — write access required (creates R2 artifact)
  try {
    await assertEventAccess(eventId, { requireWrite: true });
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return crossEvent404Response();
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const storageProvider = createR2Provider();

    const fetchCertificatePdf = async (storageKey: string): Promise<Buffer> => {
      const url = await storageProvider.getSignedUrl(storageKey, 300);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch certificate: ${storageKey}`);
      return Buffer.from(await res.arrayBuffer());
    };

    const result = await generateEventArchive({
      eventId,
      storageProvider,
      fetchCertificatePdf,
    });

    return NextResponse.json({
      archiveUrl: result.archiveUrl,
      fileCount: result.fileCount,
      archiveSizeBytes: result.archiveSizeBytes,
    });
  } catch (err) {
    console.error(`Archive generation failed for eventId=${eventId}:`, err);
    return NextResponse.json(
      { error: 'Archive generation failed' },
      { status: 500 },
    );
  }
}
