import { NextResponse } from 'next/server';
import { assertEventAccess } from '@/lib/auth/event-access';
import { generateExport, EXPORT_TYPES, type ExportType } from '@/lib/exports/excel';

type Params = Promise<{ eventId: string; type: string }>;

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const { eventId, type } = await params;

  // Validate export type
  if (!(type in EXPORT_TYPES)) {
    return NextResponse.json(
      { error: `Invalid export type: ${type}. Valid types: ${Object.keys(EXPORT_TYPES).join(', ')}` },
      { status: 400 },
    );
  }

  // Auth check — read access is sufficient for exports
  try {
    await assertEventAccess(eventId);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const buffer = await generateExport(eventId, type as ExportType);
    const meta = EXPORT_TYPES[type as ExportType];
    const filename = `${meta.label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error(`Export failed for type=${type}, eventId=${eventId}:`, err);
    return NextResponse.json(
      { error: 'Export generation failed' },
      { status: 500 },
    );
  }
}
