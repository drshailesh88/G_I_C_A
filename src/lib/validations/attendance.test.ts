import { describe, expect, it } from 'vitest';
import {
  qrScanSchema,
  manualCheckInSchema,
  attendanceQuerySchema,
  offlineSyncBatchSchema,
  checkInSearchSchema,
} from './attendance';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const REG_ID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440002';

// ── qrScanSchema ─────────────────────────────────────────────
describe('qrScanSchema', () => {
  it('accepts valid QR scan input', () => {
    const result = qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
    });
    expect(result.eventId).toBe(EVENT_ID);
    expect(result.qrPayload).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef');
  });

  it('accepts with optional sessionId', () => {
    const result = qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'payload',
      sessionId: SESSION_ID,
    });
    expect(result.sessionId).toBe(SESSION_ID);
  });

  it('accepts null sessionId', () => {
    const result = qrScanSchema.parse({
      eventId: EVENT_ID,
      qrPayload: 'payload',
      sessionId: null,
    });
    expect(result.sessionId).toBeNull();
  });

  it('rejects invalid eventId', () => {
    expect(() => qrScanSchema.parse({ eventId: 'bad', qrPayload: 'x' })).toThrow();
  });

  it('rejects empty qrPayload', () => {
    expect(() => qrScanSchema.parse({ eventId: EVENT_ID, qrPayload: '' })).toThrow();
  });
});

// ── manualCheckInSchema ──────────────────────────────────────
describe('manualCheckInSchema', () => {
  it('accepts valid manual check-in input', () => {
    const result = manualCheckInSchema.parse({
      eventId: EVENT_ID,
      registrationId: REG_ID,
    });
    expect(result.registrationId).toBe(REG_ID);
  });

  it('rejects invalid registrationId', () => {
    expect(() => manualCheckInSchema.parse({
      eventId: EVENT_ID,
      registrationId: 'not-uuid',
    })).toThrow();
  });
});

// ── attendanceQuerySchema ────────────────────────────────────
describe('attendanceQuerySchema', () => {
  it('accepts eventId only', () => {
    const result = attendanceQuerySchema.parse({ eventId: EVENT_ID });
    expect(result.eventId).toBe(EVENT_ID);
  });

  it('accepts with date filter', () => {
    const result = attendanceQuerySchema.parse({
      eventId: EVENT_ID,
      date: '2026-04-08',
    });
    expect(result.date).toBe('2026-04-08');
  });

  it('rejects invalid date format', () => {
    expect(() => attendanceQuerySchema.parse({
      eventId: EVENT_ID,
      date: '04/08/2026',
    })).toThrow();
  });
});

// ── offlineSyncBatchSchema ───────────────────────────────────
describe('offlineSyncBatchSchema', () => {
  it('accepts valid batch', () => {
    const result = offlineSyncBatchSchema.parse({
      eventId: EVENT_ID,
      records: [{
        qrPayload: 'payload1',
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: 'ipad-1',
      }],
    });
    expect(result.records).toHaveLength(1);
  });

  it('rejects empty records array', () => {
    expect(() => offlineSyncBatchSchema.parse({
      eventId: EVENT_ID,
      records: [],
    })).toThrow();
  });

  it('accepts batch with sessionId', () => {
    const result = offlineSyncBatchSchema.parse({
      eventId: EVENT_ID,
      records: [{
        qrPayload: 'payload1',
        sessionId: SESSION_ID,
        scannedAt: '2026-04-08T10:00:00Z',
        deviceId: 'ipad-1',
      }],
    });
    expect(result.records[0].sessionId).toBe(SESSION_ID);
  });
});

// ── checkInSearchSchema ──────────────────────────────────────
describe('checkInSearchSchema', () => {
  it('accepts valid search input', () => {
    const result = checkInSearchSchema.parse({
      eventId: EVENT_ID,
      query: 'Sharma',
    });
    expect(result.query).toBe('Sharma');
  });

  it('trims whitespace', () => {
    const result = checkInSearchSchema.parse({
      eventId: EVENT_ID,
      query: '  Sharma  ',
    });
    expect(result.query).toBe('Sharma');
  });

  it('rejects empty query', () => {
    expect(() => checkInSearchSchema.parse({
      eventId: EVENT_ID,
      query: '',
    })).toThrow();
  });

  it('rejects whitespace-only query', () => {
    expect(() => checkInSearchSchema.parse({
      eventId: EVENT_ID,
      query: '   ',
    })).toThrow();
  });
});
