/**
 * Accommodation Validations — Mutation Kill Tests
 *
 * Targets 57 surviving mutations in accommodation.ts (validations):
 *   - StringLiteral: .or(z.literal('')) empty string literals, error message strings
 *   - MethodExpression: .trim(), .max(N) -> .min(N), removal of .trim()
 *   - ArrayDeclaration: ACCOM_CASCADE_TRIGGER_FIELDS as []
 */
import { describe, expect, it } from 'vitest';
import {
  createAccommodationRecordSchema,
  updateAccommodationRecordSchema,
  cancelAccommodationRecordSchema,
  accommodationRecordIdSchema,
  ACCOM_CASCADE_TRIGGER_FIELDS,
  buildAccommodationChangeSummary,
  hasAccomCascadeTriggerChanges,
} from './accommodation';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const validInput = {
  personId: UUID,
  hotelName: 'Hotel Leela',
  checkInDate: '2026-05-01T14:00:00Z',
  checkOutDate: '2026-05-03T12:00:00Z',
};

// ── Kill StringLiteral on .or(z.literal('')) — create schema ──────────
describe('create schema: empty string literals for optional fields', () => {
  // Each optional field that uses .or(z.literal('')) must accept ''
  // The mutation replaces '' with 'Stryker was here!' — if test passes
  // with both, the mutation survives. We need to verify '' is specifically accepted.
  const optionalFieldsWithEmptyString = [
    'registrationId', 'hotelAddress', 'hotelCity', 'googleMapsUrl',
    'roomNumber', 'sharedRoomGroup', 'bookingReference', 'attachmentUrl',
    'specialRequests', 'notes',
  ] as const;

  for (const field of optionalFieldsWithEmptyString) {
    it(`accepts empty string '' for ${field} and preserves it`, () => {
      const input = { ...validInput, [field]: '' };
      const result = createAccommodationRecordSchema.parse(input);
      expect(result[field]).toBe('');
    });
  }

  // Kill StringLiteral on error messages — personId UUID error
  it('personId error message is exactly "Invalid person ID"', () => {
    const result = createAccommodationRecordSchema.safeParse({
      ...validInput,
      personId: 'not-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('personId'));
      expect(issue?.message).toBe('Invalid person ID');
    }
  });

  // Kill StringLiteral on checkInDate/checkOutDate min(1) error messages
  it('checkInDate error message is "Check-in date is required"', () => {
    const result = createAccommodationRecordSchema.safeParse({
      ...validInput,
      checkInDate: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('checkInDate'));
      expect(issue?.message).toBe('Check-in date is required');
    }
  });

  it('checkOutDate error message is "Check-out date is required"', () => {
    const result = createAccommodationRecordSchema.safeParse({
      ...validInput,
      checkOutDate: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('checkOutDate'));
      expect(issue?.message).toBe('Check-out date is required');
    }
  });

  // Kill StringLiteral on hotelName min(1) error "Hotel name is required"
  it('hotelName error message is "Hotel name is required"', () => {
    const result = createAccommodationRecordSchema.safeParse({
      ...validInput,
      hotelName: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('hotelName'));
      expect(issue?.message).toBe('Hotel name is required');
    }
  });

  // Kill StringLiteral on registrationId UUID error
  it('registrationId UUID error is "Invalid registration ID"', () => {
    const result = createAccommodationRecordSchema.safeParse({
      ...validInput,
      registrationId: 'not-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('registrationId'));
      expect(issue?.message).toBe('Invalid registration ID');
    }
  });
});

// ── Kill MethodExpression: .trim() mutations ──────────────────────────
describe('create schema: trim() is active on string fields', () => {
  it('trims hotelAddress', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      hotelAddress: '  123 Main St  ',
    });
    expect(result.hotelAddress).toBe('123 Main St');
  });

  it('trims hotelCity', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      hotelCity: '  Mumbai  ',
    });
    expect(result.hotelCity).toBe('Mumbai');
  });

  it('trims googleMapsUrl', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      googleMapsUrl: '  https://maps.google.com  ',
    });
    expect(result.googleMapsUrl).toBe('https://maps.google.com');
  });

  it('trims roomNumber', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      roomNumber: '  305  ',
    });
    expect(result.roomNumber).toBe('305');
  });

  it('trims sharedRoomGroup', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      sharedRoomGroup: '  GROUP-A1  ',
    });
    expect(result.sharedRoomGroup).toBe('GROUP-A1');
  });

  it('trims bookingReference', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      bookingReference: '  BK-12345  ',
    });
    expect(result.bookingReference).toBe('BK-12345');
  });

  it('trims attachmentUrl', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      attachmentUrl: '  https://storage.example.com/booking.pdf  ',
    });
    expect(result.attachmentUrl).toBe('https://storage.example.com/booking.pdf');
  });

  it('trims specialRequests', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      specialRequests: '  Ground floor preferred  ',
    });
    expect(result.specialRequests).toBe('Ground floor preferred');
  });

  it('trims notes', () => {
    const result = createAccommodationRecordSchema.parse({
      ...validInput,
      notes: '  VIP guest  ',
    });
    expect(result.notes).toBe('VIP guest');
  });
});

// ── Kill MethodExpression: .max(N) -> .min(N) mutations (update schema) ──
describe('update schema: max length enforcement and trim', () => {
  it('rejects hotelAddress > 500 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        hotelAddress: 'A'.repeat(501),
      }),
    ).toThrow();
  });

  it('accepts hotelAddress at 500 chars', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      hotelAddress: 'A'.repeat(500),
    });
    expect(result.hotelAddress).toHaveLength(500);
  });

  it('rejects hotelCity > 200 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        hotelCity: 'A'.repeat(201),
      }),
    ).toThrow();
  });

  it('rejects googleMapsUrl > 1000 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        googleMapsUrl: 'A'.repeat(1001),
      }),
    ).toThrow();
  });

  it('rejects roomNumber > 50 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        roomNumber: 'A'.repeat(51),
      }),
    ).toThrow();
  });

  it('rejects sharedRoomGroup > 100 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        sharedRoomGroup: 'A'.repeat(101),
      }),
    ).toThrow();
  });

  it('rejects bookingReference > 100 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        bookingReference: 'A'.repeat(101),
      }),
    ).toThrow();
  });

  it('rejects attachmentUrl > 500 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        attachmentUrl: 'A'.repeat(501),
      }),
    ).toThrow();
  });

  it('rejects specialRequests > 2000 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        specialRequests: 'A'.repeat(2001),
      }),
    ).toThrow();
  });

  it('rejects notes > 2000 chars', () => {
    expect(() =>
      updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        notes: 'A'.repeat(2001),
      }),
    ).toThrow();
  });

  // Kill MethodExpression: trim() on update schema fields
  it('trims hotelName in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      hotelName: '  Hotel Taj  ',
    });
    expect(result.hotelName).toBe('Hotel Taj');
  });

  it('trims hotelAddress in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      hotelAddress: '  123 Main St  ',
    });
    expect(result.hotelAddress).toBe('123 Main St');
  });

  it('trims hotelCity in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      hotelCity: '  Mumbai  ',
    });
    expect(result.hotelCity).toBe('Mumbai');
  });

  it('trims googleMapsUrl in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      googleMapsUrl: '  https://maps.google.com  ',
    });
    expect(result.googleMapsUrl).toBe('https://maps.google.com');
  });

  it('trims roomNumber in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      roomNumber: '  305  ',
    });
    expect(result.roomNumber).toBe('305');
  });

  it('trims sharedRoomGroup in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      sharedRoomGroup: '  GROUP-A1  ',
    });
    expect(result.sharedRoomGroup).toBe('GROUP-A1');
  });

  it('trims bookingReference in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      bookingReference: '  BK-12345  ',
    });
    expect(result.bookingReference).toBe('BK-12345');
  });

  it('trims attachmentUrl in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      attachmentUrl: '  https://example.com/file.pdf  ',
    });
    expect(result.attachmentUrl).toBe('https://example.com/file.pdf');
  });

  it('trims specialRequests in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      specialRequests: '  Ground floor  ',
    });
    expect(result.specialRequests).toBe('Ground floor');
  });

  it('trims notes in update schema', () => {
    const result = updateAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      notes: '  VIP  ',
    });
    expect(result.notes).toBe('VIP');
  });

  // Kill StringLiteral: error messages for update schema
  it('accommodationRecordId error message is "Invalid accommodation record ID"', () => {
    const result = updateAccommodationRecordSchema.safeParse({
      accommodationRecordId: 'not-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.message).toBe('Invalid accommodation record ID');
    }
  });

  // Kill StringLiteral: empty string or() for update optional fields
  for (const field of ['hotelAddress', 'hotelCity', 'googleMapsUrl', 'roomNumber', 'sharedRoomGroup', 'bookingReference', 'attachmentUrl', 'specialRequests', 'notes'] as const) {
    it(`update schema accepts empty string '' for ${field}`, () => {
      const result = updateAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        [field]: '',
      });
      expect(result[field]).toBe('');
    });
  }
});

// ── Kill StringLiteral + MethodExpression: cancel schema ──────────────
describe('cancel schema: mutation kills', () => {
  it('accommodationRecordId error message is exactly "Invalid accommodation record ID"', () => {
    const result = cancelAccommodationRecordSchema.safeParse({
      accommodationRecordId: 'bad',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid accommodation record ID');
    }
  });

  it('accepts empty string for reason', () => {
    const result = cancelAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      reason: '',
    });
    expect(result.reason).toBe('');
  });

  it('trims reason', () => {
    const result = cancelAccommodationRecordSchema.parse({
      accommodationRecordId: UUID,
      reason: '  Guest cancelled  ',
    });
    expect(result.reason).toBe('Guest cancelled');
  });

  it('rejects reason > 500 chars', () => {
    expect(() =>
      cancelAccommodationRecordSchema.parse({
        accommodationRecordId: UUID,
        reason: 'A'.repeat(501),
      }),
    ).toThrow();
  });
});

// ── Kill StringLiteral: accommodationRecordIdSchema ──────────────────
describe('accommodationRecordIdSchema: mutation kills', () => {
  it('error message is exactly "Invalid accommodation record ID"', () => {
    const result = accommodationRecordIdSchema.safeParse('bad');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid accommodation record ID');
    }
  });
});

// ── Kill ArrayDeclaration: ACCOM_CASCADE_TRIGGER_FIELDS ──────────────
describe('ACCOM_CASCADE_TRIGGER_FIELDS: not empty', () => {
  it('contains exactly 5 fields', () => {
    expect(ACCOM_CASCADE_TRIGGER_FIELDS).toHaveLength(5);
  });

  it('contains hotelName', () => {
    expect(ACCOM_CASCADE_TRIGGER_FIELDS).toContain('hotelName');
  });

  it('contains checkInDate', () => {
    expect(ACCOM_CASCADE_TRIGGER_FIELDS).toContain('checkInDate');
  });

  it('contains checkOutDate', () => {
    expect(ACCOM_CASCADE_TRIGGER_FIELDS).toContain('checkOutDate');
  });

  it('contains hotelCity', () => {
    expect(ACCOM_CASCADE_TRIGGER_FIELDS).toContain('hotelCity');
  });

  it('contains sharedRoomGroup', () => {
    expect(ACCOM_CASCADE_TRIGGER_FIELDS).toContain('sharedRoomGroup');
  });
});

// ── Kill StringLiteral on refine message path ────────────────────────
describe('refine: checkOutDate path in error', () => {
  it('error path is exactly ["checkOutDate"]', () => {
    const result = createAccommodationRecordSchema.safeParse({
      ...validInput,
      checkInDate: '2026-05-03T14:00:00Z',
      checkOutDate: '2026-05-01T12:00:00Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.message === 'Check-out must be after check-in');
      expect(issue?.path).toEqual(['checkOutDate']);
    }
  });
});

// ── Kill: buildAccommodationChangeSummary returns empty when no cascade fields ──
describe('buildAccommodationChangeSummary: empty object for no changes', () => {
  it('returns empty object when both prev and curr are empty', () => {
    const summary = buildAccommodationChangeSummary({}, {});
    expect(summary).toEqual({});
    expect(Object.keys(summary)).toHaveLength(0);
  });

  it('returns empty object when undefined fields match after null coercion', () => {
    const summary = buildAccommodationChangeSummary(
      { hotelName: undefined },
      { hotelName: undefined },
    );
    expect(summary).toEqual({});
  });

  it('treats null and undefined as equal (both coerce to null)', () => {
    // Both become String(null) === String(null) → "null" === "null" → no change
    const summary = buildAccommodationChangeSummary(
      { hotelName: null },
      { hotelName: undefined },
    );
    expect(Object.keys(summary)).toHaveLength(0);
  });
});

// ── Kill: hasAccomCascadeTriggerChanges returns false for identical values ──
describe('hasAccomCascadeTriggerChanges: exact boolean return', () => {
  it('returns false when all cascade fields are identical', () => {
    const result = hasAccomCascadeTriggerChanges(
      { hotelName: 'Same', checkInDate: '01', checkOutDate: '03', hotelCity: 'X', sharedRoomGroup: 'G' },
      { hotelName: 'Same', checkInDate: '01', checkOutDate: '03', hotelCity: 'X', sharedRoomGroup: 'G' },
    );
    expect(result).toBe(false);
  });
});
