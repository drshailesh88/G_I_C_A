'use server';

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { attendanceRecords } from '@/lib/db/schema/attendance';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { people } from '@/lib/db/schema/people';
import { sessions } from '@/lib/db/schema/program';
import { eq } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { offlineSyncBatchSchema } from '@/lib/validations/attendance';
import { parseQrPayload, determineScanResult } from '@/lib/attendance/qr-utils';
import type { ScanLookupResult } from '@/lib/attendance/qr-utils';

export type BatchSyncResult = {
  total: number;
  synced: number;
  duplicates: number;
  errors: number;
  results: Array<{
    index: number;
    result: ScanLookupResult;
    syncedAt: string;
  }>;
};

const eventIdSchema = offlineSyncBatchSchema.shape.eventId;

function validateBatchSyncForEvent(eventId: string, input: unknown) {
  const scopedEventId = eventIdSchema.parse(eventId);
  const validated = offlineSyncBatchSchema.parse(input);

  if (validated.eventId.toLowerCase() !== scopedEventId.toLowerCase()) {
    throw new Error('Event ID mismatch');
  }

  return { scopedEventId, validated };
}

function buildAttendanceRecordId(eventId: string, personId: string, sessionId: string | null): string {
  const hash = createHash('sha256')
    .update(`${eventId}:${personId}:${sessionId ?? 'event'}`)
    .digest('hex');

  const versionedHash = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((parseInt(hash[16] ?? '0', 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ];

  return versionedHash.join('-');
}

function isDuplicateError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = 'code' in error ? String(error.code) : undefined;
  return code === '23505' || error.message.toLowerCase().includes('duplicate key');
}

export async function processBatchSync(
  eventId: string,
  input: unknown,
): Promise<BatchSyncResult> {
  const { scopedEventId, validated } = validateBatchSyncForEvent(eventId, input);
  const { userId } = await assertEventAccess(scopedEventId, { requireWrite: true });

  const syncedAt = new Date().toISOString();
  const batchResult: BatchSyncResult = {
    total: validated.records.length,
    synced: 0,
    duplicates: 0,
    errors: 0,
    results: [],
  };

  for (let i = 0; i < validated.records.length; i++) {
    const record = validated.records[i];
    const sessionId = record.sessionId ?? null;

    // Parse QR payload
    const parsed = parseQrPayload(record.qrPayload);
    if (!parsed.valid) {
      batchResult.errors++;
      batchResult.results.push({
        index: i,
        result: { type: 'invalid', message: parsed.error },
        syncedAt,
      });
      continue;
    }

    if (parsed.eventId.toLowerCase() !== scopedEventId.toLowerCase()) {
      batchResult.errors++;
      batchResult.results.push({
        index: i,
        result: { type: 'invalid', message: 'QR code belongs to a different event.' },
        syncedAt,
      });
      continue;
    }

    // Wrap per-record processing in try/catch so one failure doesn't abort the batch
    try {
      if (sessionId) {
        const [session] = await db
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            withEventScope(
              sessions.eventId,
              scopedEventId,
              eq(sessions.id, sessionId),
            ),
          )
          .limit(1);

        if (!session) {
          batchResult.errors++;
          batchResult.results.push({
            index: i,
            result: { type: 'invalid', message: 'Session not found for this event.' },
            syncedAt,
          });
          continue;
        }
      }

      // Look up registration
      const [registration] = await db
        .select({
          id: eventRegistrations.id,
          personId: eventRegistrations.personId,
          status: eventRegistrations.status,
          cancelledAt: eventRegistrations.cancelledAt,
          registrationNumber: eventRegistrations.registrationNumber,
          category: eventRegistrations.category,
        })
        .from(eventRegistrations)
        .where(
          withEventScope(
            eventRegistrations.eventId,
            scopedEventId,
            eq(eventRegistrations.qrCodeToken, parsed.token),
          ),
        )
        .limit(1);

      if (!registration) {
        batchResult.errors++;
        batchResult.results.push({
          index: i,
          result: { type: 'invalid', message: 'QR code not recognized.' },
          syncedAt,
        });
        continue;
      }

      // Get person name
      const [person] = await db
        .select({ fullName: people.fullName })
        .from(people)
        .where(eq(people.id, registration.personId))
        .limit(1);

      const personName = person?.fullName ?? 'Unknown';

      // Check eligibility
      const scanResult = determineScanResult({
        tokenFound: true,
        registration: {
          status: registration.status,
          cancelledAt: registration.cancelledAt,
          personName,
          registrationNumber: registration.registrationNumber,
          category: registration.category,
        },
        alreadyCheckedIn: false,
        sessionId,
      });

      if (scanResult.type !== 'success') {
        if (scanResult.type === 'ineligible') {
          batchResult.errors++;
        }
        batchResult.results.push({
          index: i,
          result: scanResult,
          syncedAt,
        });
        continue;
      }

      // Insert attendance record
      try {
        await db.insert(attendanceRecords).values({
          id: buildAttendanceRecordId(scopedEventId, registration.personId, sessionId),
          eventId: scopedEventId,
          personId: registration.personId,
          registrationId: registration.id,
          sessionId,
          checkInMethod: 'qr_scan',
          checkInBy: userId,
          checkInAt: new Date(record.scannedAt),
          offlineDeviceId: record.deviceId,
          syncedAt: new Date(syncedAt),
        });

        batchResult.synced++;
        batchResult.results.push({
          index: i,
          result: scanResult,
          syncedAt,
        });
      } catch (error) {
        if (isDuplicateError(error)) {
          batchResult.duplicates++;
          batchResult.results.push({
            index: i,
            result: {
              type: 'duplicate',
              message: 'Already checked in (synced previously).',
              personName,
              registrationNumber: registration.registrationNumber,
              category: registration.category,
            },
            syncedAt,
          });
        } else {
          batchResult.errors++;
          batchResult.results.push({
            index: i,
            result: { type: 'invalid', message: 'Database error during sync.' },
            syncedAt,
          });
        }
      }
    } catch (error) {
      // DB lookup failure for this record — log and continue with next
      batchResult.errors++;
      batchResult.results.push({
        index: i,
        result: { type: 'invalid', message: 'Database error during sync.' },
        syncedAt,
      });
    }
  }

  return batchResult;
}
