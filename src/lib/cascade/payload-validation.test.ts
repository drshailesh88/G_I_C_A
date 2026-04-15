import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

import { validateCascadePayload } from './payload-validation';
import { cascadeEventDataSchema } from './payload-schemas';
import { captureError } from '@/lib/sentry';

describe('cascade-034 — Zod-validate cascade payload at handler entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing eventId yields NonRetriableError', () => {
    let caught: unknown;
    try {
      validateCascadePayload('conference/travel.saved', {});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as Error).constructor.name).toBe('NonRetriableError');
    expect((caught as Error).message).toMatch(/payload validation failed/i);
  });

  it('captures Sentry event with kind=cascade-payload-invalid on failure', () => {
    try {
      validateCascadePayload('conference/travel.saved', {});
    } catch {
      // expected
    }

    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          kind: 'cascade-payload-invalid',
        }),
      }),
    );
  });

  it('Sentry extra includes raw payload and Zod issues', () => {
    const rawPayload = { bogus: true };
    try {
      validateCascadePayload('conference/travel.saved', rawPayload);
    } catch {
      // expected
    }

    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          rawPayload: rawPayload,
          zodIssues: expect.any(Array),
          cascadeEvent: 'conference/travel.saved',
        }),
      }),
    );
  });

  it('valid payload proceeds normally (no error thrown)', () => {
    const validData = {
      eventId: 'evt-123',
      actor: { type: 'user', id: 'usr-1' },
      payload: {
        travelRecordId: 'tr-1',
        personId: 'p-1',
        registrationId: null,
        direction: 'arrival',
        travelMode: 'flight',
        fromCity: 'Delhi',
        toCity: 'Goa',
        departureAtUtc: null,
        arrivalAtUtc: null,
        pickupHub: null,
        terminalOrGate: null,
      },
    };

    const result = validateCascadePayload('conference/travel.saved', validData);
    expect(result).toEqual(validData);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('cascadeEventDataSchema rejects missing actor', () => {
    const result = cascadeEventDataSchema.safeParse({
      eventId: 'evt-123',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('cascadeEventDataSchema accepts valid envelope', () => {
    const result = cascadeEventDataSchema.safeParse({
      eventId: 'evt-123',
      actor: { type: 'system', id: 'sys' },
      payload: { anything: true },
    });
    expect(result.success).toBe(true);
  });
});
