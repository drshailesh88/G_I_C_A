import { describe, expect, it } from 'vitest';
import { createPersonSchema, updatePersonSchema, normalizePhone, personSearchSchema } from './person';

describe('createPersonSchema', () => {
  it('accepts valid person with email', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid person with phone only', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Dr. Rajesh Kumar',
      phone: '+919876543210',
    });
    expect(result.success).toBe(true);
  });

  it('rejects person with neither email nor phone', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Dr. Rajesh Kumar',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('At least one of email or mobile is required');
    }
  });

  it('rejects empty full name', () => {
    const result = createPersonSchema.safeParse({
      fullName: '',
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test Person',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all optional fields', () => {
    const result = createPersonSchema.safeParse({
      salutation: 'Dr',
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '+919876543210',
      designation: 'Professor',
      specialty: 'Cardiology',
      organization: 'AIIMS Delhi',
      city: 'New Delhi',
      tags: ['faculty', 'VIP'],
    });
    expect(result.success).toBe(true);
  });

  it('defaults tags to empty array', () => {
    const result = createPersonSchema.parse({
      fullName: 'Test Person',
      email: 'test@example.com',
    });
    expect(result.tags).toEqual([]);
  });

  it('rejects more than 20 tags', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test Person',
      email: 'test@example.com',
      tags: Array(21).fill('tag'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only phone when no other contact is provided', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test Person',
      phone: '   ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('At least one of email or mobile is required');
    }
  });

  it('rejects malformed phone numbers at the validation boundary', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test Person',
      email: 'test@example.com',
      phone: '123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === 'Invalid phone number')).toBe(true);
    }
  });
});

describe('updatePersonSchema', () => {
  it('requires personId', () => {
    const result = updatePersonSchema.safeParse({ fullName: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID personId', () => {
    const result = updatePersonSchema.safeParse({ personId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts partial fields with valid personId', () => {
    const result = updatePersonSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      fullName: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty update (only personId)', () => {
    const result = updatePersonSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid salutation enum', () => {
    const result = updatePersonSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      salutation: 'InvalidTitle',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid salutation', () => {
    const result = updatePersonSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      salutation: 'Dr',
    });
    expect(result.success).toBe(true);
  });

  it('rejects updates that clear both email and phone at once', () => {
    const result = updatePersonSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      email: '',
      phone: '   ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === 'At least one of email or mobile is required')).toBe(true);
    }
  });
});

describe('createPersonSchema edge cases', () => {
  it('rejects fullName over 200 chars', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'A'.repeat(201),
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only fullName', () => {
    const result = createPersonSchema.safeParse({
      fullName: '   ',
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects email over 254 chars', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      email: 'a'.repeat(243) + '@example.com', // 255 total
    });
    expect(result.success).toBe(false);
  });

  it('rejects designation over 200 chars', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      email: 'test@example.com',
      designation: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects specialty over 200 chars', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      email: 'test@example.com',
      specialty: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects organization over 300 chars', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      email: 'test@example.com',
      organization: 'A'.repeat(301),
    });
    expect(result.success).toBe(false);
  });

  it('rejects city over 100 chars', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      email: 'test@example.com',
      city: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('rejects tag item over 50 chars', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      email: 'test@example.com',
      tags: ['A'.repeat(51)],
    });
    expect(result.success).toBe(false);
  });

  it('treats empty string email as no-email (with phone present)', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      email: '',
      phone: '+919876543210',
    });
    expect(result.success).toBe(true);
  });

  it('treats empty string phone as no-phone (with email present)', () => {
    const result = createPersonSchema.safeParse({
      fullName: 'Test',
      phone: '',
      email: 'a@b.com',
    });
    expect(result.success).toBe(true);
  });
});

describe('normalizePhone', () => {
  it('normalizes Indian mobile number to E.164', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
  });

  it('normalizes number with country code', () => {
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
  });

  it('normalizes number with 0 prefix', () => {
    expect(normalizePhone('09876543210')).toBe('+919876543210');
  });

  it('throws on invalid phone number', () => {
    expect(() => normalizePhone('123')).toThrow('Invalid phone number');
  });

  it('handles whitespace', () => {
    expect(normalizePhone(' +91 98765 43210 ')).toBe('+919876543210');
  });

  it('normalizes international number (US)', () => {
    expect(normalizePhone('+14155551234')).toBe('+14155551234');
  });

  it('normalizes number with dashes', () => {
    expect(normalizePhone('98765-43210')).toBe('+919876543210');
  });

  it('returns empty string for empty input', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('personSearchSchema', () => {
  it('defaults to page 1, limit 25, view all', () => {
    const result = personSearchSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.view).toBe('all');
  });

  it('accepts valid search params', () => {
    const result = personSearchSchema.safeParse({
      query: 'Rajesh',
      organization: 'AIIMS',
      view: 'faculty',
      page: 2,
      limit: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid view', () => {
    const result = personSearchSchema.safeParse({
      view: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects page less than 1', () => {
    const result = personSearchSchema.safeParse({
      page: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit over 100', () => {
    const result = personSearchSchema.safeParse({
      limit: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects query over 200 chars', () => {
    const result = personSearchSchema.safeParse({
      query: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('coerces string limit to number', () => {
    const result = personSearchSchema.parse({ limit: '50' });
    expect(result.limit).toBe(50);
  });
});
