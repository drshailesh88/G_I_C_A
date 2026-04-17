import { describe, it, expect } from 'vitest';
import {
  createEventSchema,
  EVENT_TRANSITIONS,
  type EventStatus,
  registrationSettingsSchema,
} from './event';

describe('createEventSchema', () => {
  const validInput = {
    name: 'GEM India Summit 2026',
    startDate: '2026-05-15',
    endDate: '2026-05-18',
    venueName: 'Pragati Maidan, New Delhi',
    moduleToggles: {
      scientific_program: true,
      registration: true,
      travel_accommodation: true,
      certificates: true,
      qr_checkin: true,
      transport_planning: true,
      communications: true,
    },
  };

  it('accepts valid input', () => {
    const result = createEventSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects empty event name', () => {
    const result = createEventSchema.safeParse({ ...validInput, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only event name', () => {
    const result = createEventSchema.safeParse({ ...validInput, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects missing venue', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects end date before start date', () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      startDate: '2026-05-20',
      endDate: '2026-05-18',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('endDate');
    }
  });

  it('accepts same start and end date (single-day event)', () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      startDate: '2026-05-15',
      endDate: '2026-05-15',
    });
    expect(result.success).toBe(true);
  });

  it('defaults timezone to Asia/Kolkata', () => {
    const result = createEventSchema.parse(validInput);
    expect(result.timezone).toBe('Asia/Kolkata');
  });

  it('rejects impossible calendar dates instead of normalizing them', () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      startDate: '2026-02-30',
      endDate: '2026-03-02',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unsupported IANA timezones', () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      timezone: 'Mars/Olympus',
    });
    expect(result.success).toBe(false);
  });
});

describe('registrationSettingsSchema', () => {
  it('rejects malformed cutoffDate strings', () => {
    const result = registrationSettingsSchema.safeParse({
      approvalRequired: false,
      maxCapacity: 100,
      waitlistEnabled: false,
      cutoffDate: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects impossible cutoffDate values instead of normalizing them', () => {
    const result = registrationSettingsSchema.safeParse({
      approvalRequired: false,
      maxCapacity: 100,
      waitlistEnabled: false,
      cutoffDate: '2026-02-30',
    });
    expect(result.success).toBe(false);
  });
});

describe('EVENT_TRANSITIONS', () => {
  it('draft can transition to published or cancelled', () => {
    expect(EVENT_TRANSITIONS.draft).toContain('published');
    expect(EVENT_TRANSITIONS.draft).toContain('cancelled');
    expect(EVENT_TRANSITIONS.draft).not.toContain('completed');
  });

  it('published can transition to completed or cancelled', () => {
    expect(EVENT_TRANSITIONS.published).toContain('completed');
    expect(EVENT_TRANSITIONS.published).toContain('cancelled');
  });

  it('completed can only transition to archived', () => {
    expect(EVENT_TRANSITIONS.completed).toEqual(['archived']);
  });

  it('archived is terminal', () => {
    expect(EVENT_TRANSITIONS.archived).toEqual([]);
  });

  it('cancelled is terminal', () => {
    expect(EVENT_TRANSITIONS.cancelled).toEqual([]);
  });

  it('every status has a transitions entry', () => {
    const statuses: EventStatus[] = ['draft', 'published', 'completed', 'archived', 'cancelled'];
    for (const s of statuses) {
      expect(EVENT_TRANSITIONS).toHaveProperty(s);
    }
  });
});
