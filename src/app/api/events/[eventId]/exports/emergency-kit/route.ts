import { NextResponse } from 'next/server';
import { assertEventAccess } from '@/lib/auth/event-access';
import { generateEmergencyKit } from '@/lib/exports/emergency-kit';
import { createR2Provider } from '@/lib/certificates/storage';
import { eventIdSchema } from '@/lib/validations/event';

type Params = Promise<{ eventId: string }>;

/**
 * POST /api/events/{eventId}/exports/emergency-kit
 *
 * Generates the pre-event emergency kit ZIP synchronously and returns
 * a signed download URL. This is the "Download Emergency Kit" button
 * on the dashboard and reports page.
 *
 * Requires write access — this creates a new object in R2.
 */
export async function POST(
  _request: Request,
  { params }: { params: Params },
) {
  const { eventId } = await params;

  // Validate input
  const parsed = eventIdSchema.safeParse(eventId);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  // Auth check — write access required (creates R2 object)
  try {
    await assertEventAccess(eventId, { requireWrite: true });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const storageProvider = createR2Provider();

    const result = await generateEmergencyKit({
      eventId,
      storageProvider,
    });

    return NextResponse.json({
      downloadUrl: result.downloadUrl,
      fileCount: result.fileCount,
      sizeBytes: result.sizeBytes,
    });
  } catch (err) {
    console.error(`Emergency kit generation failed for eventId=${eventId}:`, err);
    return NextResponse.json(
      { error: 'Emergency kit generation failed' },
      { status: 500 },
    );
  }
}
