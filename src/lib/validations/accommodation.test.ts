import { describe, expect, it } from 'vitest';
import {
  createAccommodationRecordSchema,
  updateAccommodationRecordSchema,
  cancelAccommodationRecordSchema,
  ACCOMMODATION_RECORD_STATUSES,
  ACCOMMODATION_RECORD_TRANSITIONS,
  ROOM_TYPES,
  buildAccommodationChangeSummary,
  hasAccomCascadeTriggerChanges,
} from './accommodation';

// ── Constants ─────────────────────────────────────────────────
describe('Accommodation constants', () => {
  it('defines 5 record statuses', () => {
    expect(ACCOMMODATION_RECORD_STATUSES).toHaveLength(5);
  });

  it('defines 7 room types', () => {
    expect(ROOM_TYPES).toHaveLength(7);
    expect(ROOM_TYPES).toContain('single');
    expect(ROOM_TYPES).toContain('suite');
  });

  it('cancelled is terminal', () => {
    expect(ACCOMMODATION_RECORD_TRANSITIONS.cancelled).toEqual([]);
  });

  it('draft can transition to confirmed or cancelled', () => {
    expect(ACCOMMODATION_RECORD_TRANSITIONS.draft).toContain('confirmed');
    expect(ACCOMMODATION_RECORD_TRANSITIONS.draft).toContain('cancelled');
  });
});

// ── createAccommodationRecordSchema ───────────────────────────
describe('createAccommodationRecordSchema', () => {
  const validInput = {
    personId: '550e8400-e29b-41d4-a716-446655440000',
    hotelName: 'Hotel Leela',
    checkInDate: '2026-05-01T14:00:00Z',
    checkOutDate: '2026-05-03T12:00:00Z',
  };

  it('accepts valid minimal input', () => {
    const result = createAccommodationRecordSchema.parse(validInput);
    expect(result.hotelName).toBe('Hotel Leela');
  });

  it('accepts full input with all optional fields', () => {
    const full = {
      ...validInput,
      registrationId: '550e8400-e29b-41d4-a716-446655440001',
      hotelAddress: '123 Main St',
      hotelCity: 'Mumbai',
      googleMapsUrl: 'https://maps.google.com/...',
      roomType: 'double' as const,
      roomNumber: '305',
      sharedRoomGroup: 'GROUP-A1',
      bookingReference: 'BK-12345',
      attachmentUrl: 'https://storage.example.com/booking.pdf',
      specialRequests: 'Ground floor preferred',
      notes: 'VIP guest',
    };
    const result = createAccommodationRecordSchema.parse(full);
    expect(result.roomType).toBe('double');
    expect(result.sharedRoomGroup).toBe('GROUP-A1');
  });

  it('rejects missing hotelName', () => {
    const { hotelName, ...rest } = validInput;
    expect(() => createAccommodationRecordSchema.parse(rest)).toThrow();
  });

  it('rejects missing checkInDate', () => {
    const { checkInDate, ...rest } = validInput;
    expect(() => createAccommodationRecordSchema.parse(rest)).toThrow();
  });

  it('rejects checkout before checkin', () => {
    expect(() =>
      createAccommodationRecordSchema.parse({
        ...validInput,
        checkInDate: '2026-05-03T14:00:00Z',
        checkOutDate: '2026-05-01T12:00:00Z',
      }),
    ).toThrow('Check-out must be after check-in');
  });

  it('rejects impossible calendar dates instead of coercing them', () => {
    expect(() =>
      createAccommodationRecordSchema.parse({
        ...validInput,
        checkInDate: '2026-02-30',
      }),
    ).toThrow('Invalid check-in date');
  });

  it('trims whitespace from hotel name', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      hotelName: '  Hotel Leela  ',
    });
    expect(result.hotelName).toBe('Hotel Leela');
  });

  it('rejects invalid room type', () => {
    expect(() =>
      createAccommodationRecordSchema.parse({
        ...validInput,
        roomType: 'penthouse',
      }),
    ).toThrow();
  });
});

// ── updateAccommodationRecordSchema ───────────────────────────
describe('updateAccommodationRecordSchema', () => {
  it('requires accommodationRecordId', () => {
    expect(() => updateAccommodationRecordSchema.parse({})).toThrow();
  });

  it('accepts partial updates', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: '550e8400-e29b-41d4-a716-446655440000',
      hotelName: 'Hotel Taj',
    });
    expect(result.hotelName).toBe('Hotel Taj');
    expect(result.roomType).toBeUndefined();
  });

  it('rejects empty check-in dates in updates', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: '550e8400-e29b-41d4-a716-446655440000',
        checkInDate: '',
      }),
    ).toThrow('Invalid check-in date');
  });

  it('rejects impossible check-in/check-out ranges in updates', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: '550e8400-e29b-41d4-a716-446655440000',
        checkInDate: '2026-05-03',
        checkOutDate: '2026-05-01',
      }),
    ).toThrow('Check-out must be after check-in');
  });
});

// ── cancelAccommodationRecordSchema ───────────────────────────
describe('cancelAccommodationRecordSchema', () => {
  it('requires accommodationRecordId', () => {
    expect(() => cancelAccommodationRecordSchema.parse({})).toThrow();
  });

  it('accepts optional reason', () => {
    const result = cancelAccommodationRecordSchema.parse({
      accommodationRecordId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Guest cancelled',
    });
    expect(result.reason).toBe('Guest cancelled');
  });
});

// ── Change detection ──────────────────────────────────────────
describe('buildAccommodationChangeSummary', () => {
  it('detects hotel name change', () => {
    const summary = buildAccommodationChangeSummary(
      { hotelName: 'Hotel A' },
      { hotelName: 'Hotel B' },
    );
    expect(summary).toHaveProperty('hotelName');
    expect(summary.hotelName).toEqual({ from: 'Hotel A', to: 'Hotel B' });
  });

  it('detects shared room group change', () => {
    const summary = buildAccommodationChangeSummary(
      { sharedRoomGroup: 'GROUP-A' },
      { sharedRoomGroup: 'GROUP-B' },
    );
    expect(summary).toHaveProperty('sharedRoomGroup');
  });

  it('ignores non-cascade fields', () => {
    const summary = buildAccommodationChangeSummary(
      { roomNumber: '101' },
      { roomNumber: '202' },
    );
    expect(Object.keys(summary)).toHaveLength(0);
  });
});

describe('hasAccomCascadeTriggerChanges', () => {
  it('returns true when cascade fields changed', () => {
    expect(hasAccomCascadeTriggerChanges(
      { checkInDate: '2026-05-01' },
      { checkInDate: '2026-05-02' },
    )).toBe(true);
  });

  it('returns false when no cascade fields changed', () => {
    expect(hasAccomCascadeTriggerChanges(
      { roomNumber: '101' },
      { roomNumber: '202' },
    )).toBe(false);
  });
});
