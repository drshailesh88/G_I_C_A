/**
 * Validation Edge Cases — Gap Coverage Tests
 * Covers: CP-19 through CP-28 from spec-03-validation-edges.md
 */
import { describe, expect, it } from 'vitest';
import {
  publicRegistrationSchema,
  updateRegistrationStatusSchema,
  registrationIdSchema,
} from '@/lib/validations/registration';

const validBase = {
  fullName: 'Dr. Test',
  email: 'test@example.com',
  phone: '+919876543210',
};

// ── CP-19: Name at max length (200) accepted ────────────────
describe('CP-19: Name at max length accepted', () => {
  it('accepts 200-char name', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      fullName: 'A'.repeat(200),
    });
    expect(result.success).toBe(true);
  });
});

// ── CP-20: Name exceeding max length (201) rejected ─────────
describe('CP-20: Name exceeding max rejected', () => {
  it('rejects 201-char name', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      fullName: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ── CP-21: Invalid email format rejected ────────────────────
describe('CP-21: Invalid email rejected', () => {
  it('rejects "not-an-email"', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects email without domain', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      email: 'test@',
    });
    expect(result.success).toBe(false);
  });
});

// ── CP-22: Age boundary — 0 rejected ────────────────────────
describe('CP-22: Age 0 rejected', () => {
  it('rejects age = 0', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      age: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ── CP-23: Age boundary — 1 accepted ────────────────────────
describe('CP-23: Age 1 accepted', () => {
  it('accepts age = 1', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      age: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.age).toBe(1);
  });
});

// ── CP-24: Age boundary — 120 accepted ──────────────────────
describe('CP-24: Age 120 accepted', () => {
  it('accepts age = 120', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      age: 120,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.age).toBe(120);
  });
});

// ── CP-25: Empty string for optional fields accepted ────────
describe('CP-25: Empty optional fields accepted', () => {
  it('accepts empty strings for designation, specialty, organization, city', () => {
    const result = publicRegistrationSchema.safeParse({
      ...validBase,
      designation: '',
      specialty: '',
      organization: '',
      city: '',
    });
    expect(result.success).toBe(true);
  });
});

// ── CP-26: Preferences defaults to empty object ─────────────
describe('CP-26: Preferences defaults to {}', () => {
  it('defaults preferences to empty object when not provided', () => {
    const result = publicRegistrationSchema.parse(validBase);
    expect(result.preferences).toEqual({});
  });
});

// ── CP-27: registrationIdSchema rejects non-UUID ────────────
describe('CP-27: registrationIdSchema rejects non-UUID', () => {
  it('throws for "abc123"', () => {
    expect(() => registrationIdSchema.parse('abc123')).toThrow();
  });

  it('accepts valid UUID', () => {
    expect(() =>
      registrationIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'),
    ).not.toThrow();
  });
});

// ── CP-28: updateRegistrationStatusSchema rejects non-UUID ──
describe('CP-28: updateRegistrationStatusSchema rejects non-UUID registrationId', () => {
  it('fails for non-UUID registrationId', () => {
    const result = updateRegistrationStatusSchema.safeParse({
      eventId: '550e8400-e29b-41d4-a716-446655440099',
      registrationId: 'abc',
      newStatus: 'confirmed',
    });
    expect(result.success).toBe(false);
  });
});
