/**
 * Mutation-killing tests for attendance validation schemas.
 *
 * Targets surviving mutations:
 * - StringLiteral: exact error messages must match spec'd strings
 * - MethodExpression: .trim() on scannedAt, event fields
 * - ConditionalExpression: each schema branch tested for both paths
 * - ArrowFunction: helper function behavior
 * - ArrayDeclaration: min(1)/max(500) bounds
 */
import { describe, expect, it } from 'vitest';
import {
  qrScanSchema,
  manualCheckInSchema,
  attendanceQuerySchema,
  offlineSyncBatchSchema,
  offlineSyncItemSchema,
  checkInSearchSchema,
} from './attendance';
import { ZodError } from 'zod';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const REG_ID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440002';

// Helper to extract the first Zod error message
function getFirstZodMessage(fn: () => unknown): string {
  try {
    fn();
    throw new Error('Expected ZodError');
  } catch (e) {
    if (e instanceof ZodError) {
      return e.issues[0].message;
    }
    throw e;
  }
}

// ── StringLiteral: Exact error messages ─────────────────────────
describe('qrScanSchema exact error messages', () => {
  it('reports "Invalid event ID" for bad eventId', () => {
    const msg = getFirstZodMessage(() =>
      qrScanSchema.parse({ eventId: 'bad', qrPayload: 'x' }),
    );
    expect(msg).toBe('Invalid event ID');
  });

  it('reports "QR payload is required" for empty qrPayload', () => {
    const msg = getFirstZodMessage(() =>
      qrScanSchema.parse({ eventId: EVENT_ID, qrPayload: '' }),
    );
    expect(msg).toBe('QR payload is required');
  });

  it('reports "Invalid session ID" for bad sessionId', () => {
    const msg = getFirstZodMessage(() =>
      qrScanSchema.parse({ eventId: EVENT_ID, qrPayload: 'x', sessionId: 'bad' }),
    );
    expect(msg).toBe('Invalid session ID');
  });

  it('reports "Device ID is required" for empty deviceId', () => {
    const msg = getFirstZodMessage(() =>
      qrScanSchema.parse({ eventId: EVENT_ID, qrPayload: 'x', deviceId: '' }),
    );
    expect(msg).toBe('Device ID is required');
  });
});

describe('manualCheckInSchema exact error messages', () => {
  it('reports "Invalid event ID" for bad eventId', () => {
    const msg = getFirstZodMessage(() =>
      manualCheckInSchema.parse({ eventId: 'bad', registrationId: REG_ID }),
    );
    expect(msg).toBe('Invalid event ID');
  });

  it('reports "Invalid registration ID" for bad registrationId', () => {
    const msg = getFirstZodMessage(() =>
      manualCheckInSchema.parse({ eventId: EVENT_ID, registrationId: 'bad' }),
    );
    expect(msg).toBe('Invalid registration ID');
  });

  it('reports "Invalid session ID" for bad sessionId', () => {
    const msg = getFirstZodMessage(() =>
      manualCheckInSchema.parse({
        eventId: EVENT_ID,
        registrationId: REG_ID,
        sessionId: 'bad',
      }),
    );
    expect(msg).toBe('Invalid session ID');
  });
});

describe('attendanceQuerySchema exact error messages', () => {
  it('reports "Invalid event ID" for bad eventId', () => {
    const msg = getFirstZodMessage(() =>
      attendanceQuerySchema.parse({ eventId: 'bad' }),
    );
    expect(msg).toBe('Invalid event ID');
  });

  it('reports "Invalid session ID" for bad sessionId', () => {
    const msg = getFirstZodMessage(() =>
      attendanceQuerySchema.parse({ eventId: EVENT_ID, sessionId: 'bad' }),
    );
    expect(msg).toBe('Invalid session ID');
  });

  it('reports "Invalid date format (YYYY-MM-DD)" for bad date', () => {
    const msg = getFirstZodMessage(() =>
      attendanceQuerySchema.parse({ eventId: EVENT_ID, date: 'not-a-date' }),
    );
    expect(msg).toBe('Invalid date format (YYYY-MM-DD)');
  });
});

describe('offlineSyncItemSchema exact error messages', () => {
  it('reports "QR payload is required" for empty qrPayload', () => {
    const msg = getFirstZodMessage(() =>
      offlineSyncItemSchema.parse({
        qrPayload: '',
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: 'ipad-1',
      }),
    );
    expect(msg).toBe('QR payload is required');
  });

  it('reports "Invalid ISO datetime" for bad scannedAt', () => {
    const msg = getFirstZodMessage(() =>
      offlineSyncItemSchema.parse({
        qrPayload: 'payload',
        scannedAt: 'not-datetime',
        deviceId: 'ipad-1',
      }),
    );
    expect(msg).toBe('Invalid ISO datetime');
  });

  it('reports "Device ID is required" for empty deviceId', () => {
    const msg = getFirstZodMessage(() =>
      offlineSyncItemSchema.parse({
        qrPayload: 'payload',
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: '',
      }),
    );
    expect(msg).toBe('Device ID is required');
  });

  it('reports "Invalid session ID" for bad sessionId', () => {
    const msg = getFirstZodMessage(() =>
      offlineSyncItemSchema.parse({
        qrPayload: 'payload',
        sessionId: 'bad',
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: 'ipad-1',
      }),
    );
    expect(msg).toBe('Invalid session ID');
  });
});

describe('offlineSyncBatchSchema exact error messages', () => {
  it('reports "Invalid event ID" for bad eventId', () => {
    const msg = getFirstZodMessage(() =>
      offlineSyncBatchSchema.parse({
        eventId: 'bad',
        records: [{
          qrPayload: 'x',
          scannedAt: '2026-04-08T10:00:00Z',
          deviceId: 'ipad-1',
        }],
      }),
    );
    expect(msg).toBe('Invalid event ID');
  });
});

describe('checkInSearchSchema exact error messages', () => {
  it('reports "Invalid event ID" for bad eventId', () => {
    const msg = getFirstZodMessage(() =>
      checkInSearchSchema.parse({ eventId: 'bad', query: 'test' }),
    );
    expect(msg).toBe('Invalid event ID');
  });

  it('reports "Search query is required" for empty query', () => {
    const msg = getFirstZodMessage(() =>
      checkInSearchSchema.parse({ eventId: EVENT_ID, query: '' }),
    );
    expect(msg).toBe('Search query is required');
  });
});

// ── MethodExpression: .trim() on fields ─────────────────────────
describe('offlineSyncItemSchema .trim() behavior', () => {
  it('trims whitespace from scannedAt', () => {
    const result = offlineSyncItemSchema.parse({
      qrPayload: 'payload',
      scannedAt: '  2026-04-08T10:00:00Z  ',
      deviceId: 'ipad-1',
    });
    expect(result.scannedAt).toBe('2026-04-08T10:00:00Z');
  });

  it('trims whitespace from qrPayload', () => {
    const result = offlineSyncItemSchema.parse({
      qrPayload: '  payload  ',
      scannedAt: '2026-04-08T10:00:00Z',
      deviceId: 'ipad-1',
    });
    expect(result.qrPayload).toBe('payload');
  });

  it('trims whitespace from deviceId', () => {
    const result = offlineSyncItemSchema.parse({
      qrPayload: 'payload',
      scannedAt: '2026-04-08T10:00:00Z',
      deviceId: '  ipad-1  ',
    });
    expect(result.deviceId).toBe('ipad-1');
  });
});

describe('attendanceQuerySchema .trim() behavior', () => {
  it('trims whitespace from eventId', () => {
    const result = attendanceQuerySchema.parse({
      eventId: `  ${EVENT_ID}  `,
    });
    expect(result.eventId).toBe(EVENT_ID);
  });

  it('trims whitespace from date', () => {
    const result = attendanceQuerySchema.parse({
      eventId: EVENT_ID,
      date: '  2026-04-08  ',
    });
    expect(result.date).toBe('2026-04-08');
  });
});

describe('manualCheckInSchema .trim() behavior', () => {
  it('trims whitespace from eventId', () => {
    const result = manualCheckInSchema.parse({
      eventId: `  ${EVENT_ID}  `,
      registrationId: REG_ID,
    });
    expect(result.eventId).toBe(EVENT_ID);
  });

  it('trims whitespace from registrationId', () => {
    const result = manualCheckInSchema.parse({
      eventId: EVENT_ID,
      registrationId: `  ${REG_ID}  `,
    });
    expect(result.registrationId).toBe(REG_ID);
  });
});

// ── ArrowFunction: uuidSchema and requiredTrimmedString helpers ─
describe('uuidSchema helper validates UUID format', () => {
  it('rejects non-UUID strings in all schemas', () => {
    // qrScanSchema eventId
    expect(() => qrScanSchema.parse({ eventId: 'abc', qrPayload: 'x' })).toThrow();
    // manualCheckInSchema eventId
    expect(() => manualCheckInSchema.parse({ eventId: 'abc', registrationId: 'x' })).toThrow();
    // attendanceQuerySchema eventId
    expect(() => attendanceQuerySchema.parse({ eventId: 'abc' })).toThrow();
    // offlineSyncBatchSchema eventId
    expect(() => offlineSyncBatchSchema.parse({ eventId: 'abc', records: [] })).toThrow();
    // checkInSearchSchema eventId
    expect(() => checkInSearchSchema.parse({ eventId: 'abc', query: 'x' })).toThrow();
  });
});

describe('requiredTrimmedString helper enforces min(1) after trim', () => {
  it('rejects whitespace-only strings across schemas', () => {
    // qrPayload
    expect(() =>
      qrScanSchema.parse({ eventId: EVENT_ID, qrPayload: '   ' }),
    ).toThrow();
    // search query
    expect(() =>
      checkInSearchSchema.parse({ eventId: EVENT_ID, query: '   ' }),
    ).toThrow();
  });
});

// ── Max length boundaries ──────────────────────────────────────
describe('offlineSyncItemSchema max lengths', () => {
  it('accepts qrPayload at exactly 500 chars', () => {
    const result = offlineSyncItemSchema.parse({
      qrPayload: 'x'.repeat(500),
      scannedAt: '2026-04-08T10:00:00Z',
      deviceId: 'ipad-1',
    });
    expect(result.qrPayload).toHaveLength(500);
  });

  it('rejects qrPayload over 500 chars', () => {
    expect(() =>
      offlineSyncItemSchema.parse({
        qrPayload: 'x'.repeat(501),
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: 'ipad-1',
      }),
    ).toThrow();
  });

  it('accepts deviceId at exactly 100 chars', () => {
    const result = offlineSyncItemSchema.parse({
      qrPayload: 'payload',
      scannedAt: '2026-04-08T10:00:00Z',
      deviceId: 'x'.repeat(100),
    });
    expect(result.deviceId).toHaveLength(100);
  });

  it('rejects deviceId over 100 chars', () => {
    expect(() =>
      offlineSyncItemSchema.parse({
        qrPayload: 'payload',
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: 'x'.repeat(101),
      }),
    ).toThrow();
  });
});
