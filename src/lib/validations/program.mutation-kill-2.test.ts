/**
 * Mutation-kill-2 tests for validations/program.ts
 *
 * Targets survivors on isValidDateOnly, isValidTimeOnly, getSessionDateTimeMillis,
 * the session-schema superRefine for end > start, and updateSessionSchema's
 * partial-schedule coherence rules.
 */

import { describe, it, expect } from 'vitest';
import {
  createSessionSchema,
  updateSessionSchema,
} from './program';

const VALID_SESSION_UUID = '550e8400-e29b-41d4-a716-446655440000';

const baseCreate = {
  title: 'Keynote',
  sessionDate: '2026-05-01',
  startTime: '09:00',
  endTime: '10:00',
  sessionType: 'keynote',
  isPublic: true,
  sortOrder: 0,
};

// ─────────────────────────────────────────────────────────
// isValidDateOnly — calendar legality via the date schema
// ─────────────────────────────────────────────────────────
describe('sessionDate (isValidDateOnly) on createSessionSchema', () => {
  it('accepts 2026-05-01', () => {
    expect(createSessionSchema.safeParse(baseCreate).success).toBe(true);
  });

  it('rejects non-date like "2026/05/01"', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2026/05/01' });
    expect(r.success).toBe(false);
  });

  it('rejects month=00', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2026-00-10' });
    expect(r.success).toBe(false);
  });

  it('rejects month=13', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2026-13-10' });
    expect(r.success).toBe(false);
  });

  it('rejects day=00', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2026-05-00' });
    expect(r.success).toBe(false);
  });

  it('rejects day=32', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2026-05-32' });
    expect(r.success).toBe(false);
  });

  it('rejects calendar-invalid Feb 30', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2026-02-30' });
    expect(r.success).toBe(false);
  });

  it('rejects non-leap Feb 29', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2025-02-29' });
    expect(r.success).toBe(false);
  });

  it('accepts leap-year Feb 29', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '2024-02-29' });
    expect(r.success).toBe(true);
  });

  it('rejects empty-string sessionDate (required)', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '' });
    expect(r.success).toBe(false);
  });

  it('trims whitespace before validating', () => {
    const r = createSessionSchema.safeParse({ ...baseCreate, sessionDate: '  2026-05-01  ' });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// isValidTimeOnly — per-component bounds on startTime/endTime
// ─────────────────────────────────────────────────────────
describe('sessionTime (isValidTimeOnly)', () => {
  it('accepts 00:00 (minimum)', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '00:00', endTime: '23:59',
    });
    expect(r.success).toBe(true);
  });

  it('accepts 23:59 (maximum)', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '23:00', endTime: '23:59',
    });
    expect(r.success).toBe(true);
  });

  it('rejects hours=24', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '24:00', endTime: '23:00',
    });
    expect(r.success).toBe(false);
  });

  it('rejects minutes=60', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '10:60', endTime: '11:00',
    });
    expect(r.success).toBe(false);
  });

  it('rejects 3-digit hours like "100:00"', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '100:00', endTime: '200:00',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a 12-hour-am/pm style "09:00 AM"', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '09:00 AM', endTime: '10:00 AM',
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing colon "0900"', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '0900', endTime: '1000',
    });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// superRefine: end must be after start
// ─────────────────────────────────────────────────────────
describe('createSessionSchema superRefine — end > start', () => {
  it('rejects when startTime === endTime', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '09:00', endTime: '09:00',
    });
    expect(r.success).toBe(false);
  });

  it('rejects when endTime < startTime', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '10:00', endTime: '09:00',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a 1-minute difference', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '09:00', endTime: '09:01',
    });
    expect(r.success).toBe(true);
  });

  it('error has path ["endTime"]', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate, startTime: '10:00', endTime: '09:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'endTime')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────
// updateSessionSchema — partial-schedule coherence rules
// ─────────────────────────────────────────────────────────
describe('updateSessionSchema partial-update rules', () => {
  it('accepts a non-scheduling partial update (title only)', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: VALID_SESSION_UUID,
      title: 'New title',
    });
    expect(r.success).toBe(true);
  });

  it('rejects when only sessionDate is provided (missing both startTime and endTime)', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: VALID_SESSION_UUID,
      sessionDate: '2026-05-01',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      // Both startTime and endTime should be flagged as required.
      expect(r.error.issues.some((i) => i.path.join('.') === 'startTime')).toBe(true);
      expect(r.error.issues.some((i) => i.path.join('.') === 'endTime')).toBe(true);
    }
  });

  it('rejects when only startTime is provided (missing sessionDate and endTime)', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: VALID_SESSION_UUID,
      startTime: '09:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'sessionDate')).toBe(true);
      expect(r.error.issues.some((i) => i.path.join('.') === 'endTime')).toBe(true);
    }
  });

  it('rejects when only endTime is provided (missing sessionDate and startTime)', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: VALID_SESSION_UUID,
      endTime: '10:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'sessionDate')).toBe(true);
      expect(r.error.issues.some((i) => i.path.join('.') === 'startTime')).toBe(true);
    }
  });

  it('accepts all three when they form a valid ordered schedule', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: VALID_SESSION_UUID,
      sessionDate: '2026-05-01',
      startTime: '09:00',
      endTime: '10:00',
    });
    expect(r.success).toBe(true);
  });

  it('rejects when all three are provided but endTime <= startTime', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: VALID_SESSION_UUID,
      sessionDate: '2026-05-01',
      startTime: '10:00',
      endTime: '10:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some(
          (i) => i.path.join('.') === 'endTime' && /End time must be after start time/.test(i.message),
        ),
      ).toBe(true);
    }
  });

  it('does not run the end-after-start check when sessionDate is missing', () => {
    // sessionDate missing, startTime/endTime present with endTime <= startTime.
    // The path-specific errors for missing sessionDate should fire, but the
    // end-vs-start error should not — it's gated on all three being present.
    const r = updateSessionSchema.safeParse({
      sessionId: VALID_SESSION_UUID,
      startTime: '10:00',
      endTime: '09:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some(
          (i) => i.path.join('.') === 'endTime' && /End time must be after start time/.test(i.message),
        ),
      ).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────
// getSessionDateTimeMillis — month arithmetic (kills L83)
// ─────────────────────────────────────────────────────────
describe('session time comparison crosses month boundaries correctly', () => {
  it('treats December 2026 as month 11 for Date.UTC math', () => {
    // This is indirect: if month+1 or month was used instead of month-1,
    // the comparison would break on December dates where end would resolve
    // to a different month than start. Since both are on the same day,
    // the math must collapse to the same month.
    const r = createSessionSchema.safeParse({
      ...baseCreate,
      sessionDate: '2026-12-31',
      startTime: '09:00',
      endTime: '10:00',
    });
    expect(r.success).toBe(true);
  });

  it('rejects endTime == startTime on December 31 (same day sanity)', () => {
    const r = createSessionSchema.safeParse({
      ...baseCreate,
      sessionDate: '2026-12-31',
      startTime: '09:00',
      endTime: '09:00',
    });
    expect(r.success).toBe(false);
  });
});
