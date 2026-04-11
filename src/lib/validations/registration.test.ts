import { describe, expect, it } from 'vitest';
import {
  publicRegistrationSchema,
  updateRegistrationStatusSchema,
  REGISTRATION_TRANSITIONS,
  generateRegistrationNumber,
  generateQrToken,
} from './registration';

describe('publicRegistrationSchema', () => {
  it('accepts valid registration', () => {
    const result = publicRegistrationSchema.safeParse({
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '+919876543210',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = publicRegistrationSchema.safeParse({
      fullName: '',
      email: 'test@example.com',
      phone: '+919876543210',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing email', () => {
    const result = publicRegistrationSchema.safeParse({
      fullName: 'Test Person',
      phone: '+919876543210',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing phone', () => {
    const result = publicRegistrationSchema.safeParse({
      fullName: 'Test Person',
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all optional fields', () => {
    const result = publicRegistrationSchema.safeParse({
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '+919876543210',
      designation: 'Professor',
      specialty: 'Cardiology',
      organization: 'AIIMS Delhi',
      city: 'New Delhi',
      age: 45,
      preferences: { dietary: 'vegetarian' },
    });
    expect(result.success).toBe(true);
  });

  it('coerces age to number', () => {
    const result = publicRegistrationSchema.parse({
      fullName: 'Test',
      email: 'test@example.com',
      phone: '+919876543210',
      age: '45',
    });
    expect(result.age).toBe(45);
  });

  it('rejects age > 120', () => {
    const result = publicRegistrationSchema.safeParse({
      fullName: 'Test',
      email: 'test@example.com',
      phone: '+919876543210',
      age: 121,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateRegistrationStatusSchema', () => {
  it('accepts valid status update', () => {
    const result = updateRegistrationStatusSchema.safeParse({
      eventId: '550e8400-e29b-41d4-a716-446655440099',
      registrationId: '550e8400-e29b-41d4-a716-446655440000',
      newStatus: 'confirmed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateRegistrationStatusSchema.safeParse({
      eventId: '550e8400-e29b-41d4-a716-446655440099',
      registrationId: '550e8400-e29b-41d4-a716-446655440000',
      newStatus: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('REGISTRATION_TRANSITIONS', () => {
  it('allows pending → confirmed', () => {
    expect(REGISTRATION_TRANSITIONS.pending).toContain('confirmed');
  });

  it('allows pending → waitlisted', () => {
    expect(REGISTRATION_TRANSITIONS.pending).toContain('waitlisted');
  });

  it('allows confirmed → cancelled', () => {
    expect(REGISTRATION_TRANSITIONS.confirmed).toContain('cancelled');
  });

  it('blocks declined → anything', () => {
    expect(REGISTRATION_TRANSITIONS.declined).toHaveLength(0);
  });

  it('blocks cancelled → anything', () => {
    expect(REGISTRATION_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('allows waitlisted → confirmed', () => {
    expect(REGISTRATION_TRANSITIONS.waitlisted).toContain('confirmed');
  });
});

describe('generateRegistrationNumber', () => {
  it('generates formatted registration number', () => {
    const regNo = generateRegistrationNumber('gem-india-2026', 'delegate', 412);
    expect(regNo).toBe('GEMINDIA-DEL-00412');
  });

  it('pads sequence to 5 digits', () => {
    const regNo = generateRegistrationNumber('summit', 'faculty', 1);
    expect(regNo).toMatch(/-FAC-00001$/);
  });

  it('truncates long slugs to 8 chars', () => {
    const regNo = generateRegistrationNumber('very-long-event-slug', 'delegate', 1);
    expect(regNo.split('-')[0].length).toBeLessThanOrEqual(8);
  });
});

describe('generateQrToken', () => {
  it('generates 32-character token', () => {
    const token = generateQrToken();
    expect(token).toHaveLength(32);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateQrToken()));
    expect(tokens.size).toBe(100);
  });

  it('contains only alphanumeric characters', () => {
    const token = generateQrToken();
    expect(token).toMatch(/^[A-Za-z0-9]+$/);
  });
});
