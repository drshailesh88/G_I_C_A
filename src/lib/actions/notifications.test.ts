import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Test the Zod schemas used in the notification server actions.
// We replicate them here since we can't import the 'use server' file
// without triggering Clerk auth.

const retrySchema = z.object({
  eventId: z.string().uuid(),
  notificationLogId: z.string().uuid(),
});

const resendSchema = z.object({
  eventId: z.string().uuid(),
  notificationLogId: z.string().uuid(),
});

const listFailedSchema = z.object({
  eventId: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']).optional(),
  templateKey: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

describe('Notification action schemas', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  describe('retrySchema', () => {
    it('accepts valid input', () => {
      const result = retrySchema.safeParse({
        eventId: validUuid,
        notificationLogId: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-UUID eventId', () => {
      const result = retrySchema.safeParse({
        eventId: 'not-uuid',
        notificationLogId: validUuid,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing notificationLogId', () => {
      const result = retrySchema.safeParse({ eventId: validUuid });
      expect(result.success).toBe(false);
    });
  });

  describe('resendSchema', () => {
    it('accepts valid input', () => {
      const result = resendSchema.safeParse({
        eventId: validUuid,
        notificationLogId: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty strings', () => {
      const result = resendSchema.safeParse({
        eventId: '',
        notificationLogId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listFailedSchema', () => {
    it('accepts minimal input (eventId only)', () => {
      const result = listFailedSchema.safeParse({ eventId: validUuid });
      expect(result.success).toBe(true);
    });

    it('accepts full filters', () => {
      const result = listFailedSchema.safeParse({
        eventId: validUuid,
        channel: 'email',
        templateKey: 'registration_confirmation',
        limit: 25,
        offset: 50,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid channel', () => {
      const result = listFailedSchema.safeParse({
        eventId: validUuid,
        channel: 'sms',
      });
      expect(result.success).toBe(false);
    });

    it('rejects whitespace-only templateKey', () => {
      const result = listFailedSchema.safeParse({
        eventId: validUuid,
        templateKey: '   ',
      });
      expect(result.success).toBe(false);
    });

    it('rejects templateKey longer than 100 characters', () => {
      const result = listFailedSchema.safeParse({
        eventId: validUuid,
        templateKey: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('rejects limit > 200', () => {
      const result = listFailedSchema.safeParse({
        eventId: validUuid,
        limit: 201,
      });
      expect(result.success).toBe(false);
    });

    it('rejects limit < 1', () => {
      const result = listFailedSchema.safeParse({
        eventId: validUuid,
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative offset', () => {
      const result = listFailedSchema.safeParse({
        eventId: validUuid,
        offset: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});
