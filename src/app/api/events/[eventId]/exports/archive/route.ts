import { NextResponse } from 'next/server';
import { assertEventAccess } from '@/lib/auth/event-access';
import { generateEventArchive } from '@/lib/exports/archive';
import { createR2Provider } from '@/lib/certificates/storage';

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
    const storageProvider = createR2Provider();

    const fetchCertificatePdf = async (storageKey: string): Promise<Buffer> => {
      // Get signed URL then fetch the PDF
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
