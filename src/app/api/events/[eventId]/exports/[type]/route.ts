import { NextResponse } from 'next/server';
import { assertEventAccess, EventNotFoundError } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { generateExport, EXPORT_TYPES, type ExportType } from '@/lib/exports/excel';

type Params = Promise<{ eventId: string; type: string }>;

// Exports surface attendee PII and event-management data. Ops is restricted
// to logistics surfaces only, so their event-read access does not extend here.
const EXPORT_READ_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

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

  // Auth check — read access is required, but exports expose event-management
  // PII (attendees, registrations, faculty) that logistics-only roles must not
  // be able to exfiltrate. Require an event-management role beyond generic access.
  try {
    const { role } = await assertEventAccess(eventId);
    if (!role || !EXPORT_READ_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return crossEvent404Response();
    }
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
