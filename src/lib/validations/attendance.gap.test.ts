import { describe, expect, it } from 'vitest';
import {
  qrScanSchema,
  manualCheckInSchema,
  attendanceQuerySchema,
  offlineSyncBatchSchema,
  offlineSyncItemSchema,
  checkInSearchSchema,
} from './attendance';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const REG_ID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440002';

// ── Gap: offlineSyncBatchSchema max 500 ──────────────────────
describe('offlineSyncBatchSchema limits', () => {
  const makeRecord = (i: number) => ({
    qrPayload: `payload-${i}`,
    scannedAt: '2026-04-08T10:00:00Z',
    deviceId: 'ipad-1',
  });

  it('accepts exactly 500 records', () => {
    const records = Array.from({ length: 500 }, (_, i) => makeRecord(i));
    const result = offlineSyncBatchSchema.parse({ eventId: EVENT_ID, records });
    expect(result.records).toHaveLength(500);
  });

  it('rejects 501 records', () => {
    const records = Array.from({ length: 501 }, (_, i) => makeRecord(i));
    expect(() => offlineSyncBatchSchema.parse({ eventId: EVENT_ID, records })).toThrow();
  });
});

// ── Gap: checkInSearchSchema max 200 chars ──────────────────
describe('checkInSearchSchema query length', () => {
  it('accepts query with exactly 200 characters', () => {
    const query = 'a'.repeat(200);
    const result = checkInSearchSchema.parse({ eventId: EVENT_ID, query });
    expect(result.query).toHaveLength(200);
  });

  it('rejects query with 201 characters', () => {
    const query = 'a'.repeat(201);
    expect(() => checkInSearchSchema.parse({ eventId: EVENT_ID, query })).toThrow();
  });
});

// ── Gap: offlineSyncItemSchema scannedAt validation ──────────
describe('offlineSyncItemSchema datetime validation', () => {
  it('rejects non-ISO datetime string', () => {
    expect(() => offlineSyncItemSchema.parse({
      qrPayload: 'payload',
      scannedAt: '2026-04-08 10:00:00',
      deviceId: 'ipad-1',
    })).toThrow();
  });

  it('rejects plain date without time', () => {
    expect(() => offlineSyncItemSchema.parse({
      qrPayload: 'payload',
      scannedAt: '2026-04-08',
      deviceId: 'ipad-1',
    })).toThrow();
  });

  it('accepts valid ISO datetime with timezone', () => {
    const result = offlineSyncItemSchema.parse({
      qrPayload: 'payload',
      scannedAt: '2026-04-08T10:00:00.000Z',
      deviceId: 'ipad-1',
    });
    expect(result.scannedAt).toBe('2026-04-08T10:00:00.000Z');
  });
});

// ── Gap: qrScanSchema trims qrPayload ───────────────────────
describe('qrScanSchema trimming', () => {
  it('trims qrPayload whitespace', () => {
    const result = qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: '  payload-with-spaces  ',
    });
    expect(result.qrPayload).toBe('payload-with-spaces');
  });

  it('trims deviceId whitespace', () => {
    const result = qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'payload',
      deviceId: '  ipad-1  ',
    });
    expect(result.deviceId).toBe('ipad-1');
  });
});

// ── Gap: manualCheckInSchema with sessionId ──────────────────
describe('manualCheckInSchema with sessionId', () => {
  it('accepts valid sessionId', () => {
    const result = manualCheckInSchema.parse({
      eventId: EVENT_ID,
      registrationId: REG_ID,
      sessionId: SESSION_ID,
    });
    expect(result.sessionId).toBe(SESSION_ID);
  });

  it('accepts null sessionId', () => {
    const result = manualCheckInSchema.parse({
      eventId: EVENT_ID,
      registrationId: REG_ID,
      sessionId: null,
    });
    expect(result.sessionId).toBeNull();
  });

  it('rejects invalid sessionId', () => {
    expect(() => manualCheckInSchema.parse({
      eventId: EVENT_ID,
      registrationId: REG_ID,
      sessionId: 'not-uuid',
    })).toThrow();
  });
});

// ── Gap: attendanceQuerySchema with sessionId ────────────────
describe('attendanceQuerySchema with sessionId', () => {
  it('accepts valid sessionId', () => {
    const result = attendanceQuerySchema.parse({
      eventId: EVENT_ID,
      sessionId: SESSION_ID,
    });
    expect(result.sessionId).toBe(SESSION_ID);
  });

  it('accepts null sessionId', () => {
    const result = attendanceQuerySchema.parse({
      eventId: EVENT_ID,
      sessionId: null,
    });
    expect(result.sessionId).toBeNull();
  });

  it('rejects invalid sessionId', () => {
    expect(() => attendanceQuerySchema.parse({
      eventId: EVENT_ID,
      sessionId: 'bad',
    })).toThrow();
  });
});

// ── Gap: offlineSyncBatchSchema strict on outer object ────────
describe('offlineSyncBatchSchema strict on outer', () => {
  it('rejects extra properties on the outer object', () => {
    expect(() => offlineSyncBatchSchema.parse({
      eventId: EVENT_ID,
      records: [{
        qrPayload: 'payload',
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: 'ipad-1',
      }],
      admin: true,
    })).toThrow();
  });
});

// ── Gap: qrScanSchema with deviceId over max length ──────────
describe('qrScanSchema deviceId length', () => {
  it('accepts deviceId at exactly 100 characters', () => {
    const result = qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'payload',
      deviceId: 'x'.repeat(100),
    });
    expect(result.deviceId).toHaveLength(100);
  });

  it('rejects deviceId over 100 characters', () => {
    expect(() => qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'payload',
      deviceId: 'x'.repeat(101),
    })).toThrow();
  });
});

// ── Gap: qrScanSchema qrPayload max 500 ─────────────────────
describe('qrScanSchema qrPayload length', () => {
  it('accepts qrPayload at exactly 500 characters', () => {
    const result = qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'x'.repeat(500),
    });
    expect(result.qrPayload).toHaveLength(500);
  });

  it('rejects qrPayload over 500 characters', () => {
    expect(() => qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'x'.repeat(501),
    })).toThrow();
  });
});
