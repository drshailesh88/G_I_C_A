import { describe, expect, it } from 'vitest';
import { createPersonSchema, normalizePhone, personSearchSchema } from './person';

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
});
