import { describe, it, expect } from 'vitest';
import {
  createEventSchema,
  eventIdSchema,
  moduleTogglesSchema,
  updateEventStatusSchema,
  EVENT_STATUSES,
  EVENT_TRANSITIONS,
  MODULE_KEYS,
  type EventStatus,
} from './event';

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

describe('createEventSchema — required field limits', () => {
  it('rejects name over 200 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, name: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 200 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, name: 'x'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('rejects venueName whitespace-only', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueName: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects venueName over 300 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueName: 'x'.repeat(301) });
    expect(result.success).toBe(false);
  });

  it('accepts venueName at exactly 300 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueName: 'x'.repeat(300) });
    expect(result.success).toBe(true);
  });

  it('rejects missing startDate', () => {
    const { startDate, ...noStart } = validInput;
    const result = createEventSchema.safeParse(noStart);
    expect(result.success).toBe(false);
  });

  it('rejects missing endDate', () => {
    const { endDate, ...noEnd } = validInput;
    const result = createEventSchema.safeParse(noEnd);
    expect(result.success).toBe(false);
  });
});

describe('createEventSchema — optional field limits', () => {
  it('rejects venueAddress over 500 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueAddress: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts venueAddress at 500 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueAddress: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('rejects venueCity over 100 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueCity: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects venueMapUrl that is not a URL', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueMapUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts venueMapUrl as empty string', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueMapUrl: '' });
    expect(result.success).toBe(true);
  });

  it('accepts venueMapUrl as valid URL', () => {
    const result = createEventSchema.safeParse({ ...validInput, venueMapUrl: 'https://maps.google.com/test' });
    expect(result.success).toBe(true);
  });

  it('rejects description over 2000 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, description: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('accepts description at 2000 chars', () => {
    const result = createEventSchema.safeParse({ ...validInput, description: 'x'.repeat(2000) });
    expect(result.success).toBe(true);
  });

  it('accepts omitted description', () => {
    const result = createEventSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('end date after start date accepted', () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      startDate: '2026-05-15',
      endDate: '2026-05-20',
    });
    expect(result.success).toBe(true);
  });
});

describe('moduleTogglesSchema', () => {
  it('all 7 keys default to true on empty object', () => {
    const result = moduleTogglesSchema.parse({});
    for (const key of MODULE_KEYS) {
      expect(result[key]).toBe(true);
    }
  });

  it('individual toggle can be set to false', () => {
    const result = moduleTogglesSchema.parse({ scientific_program: false });
    expect(result.scientific_program).toBe(false);
    expect(result.registration).toBe(true);
  });

  it('accepts partial toggles — rest default to true', () => {
    const result = moduleTogglesSchema.parse({ certificates: false, qr_checkin: false });
    expect(result.certificates).toBe(false);
    expect(result.qr_checkin).toBe(false);
    expect(result.scientific_program).toBe(true);
    expect(result.registration).toBe(true);
    expect(result.travel_accommodation).toBe(true);
    expect(result.transport_planning).toBe(true);
    expect(result.communications).toBe(true);
  });

  it('has exactly 7 module keys', () => {
    expect(MODULE_KEYS.length).toBe(7);
  });
});

describe('eventIdSchema', () => {
  it('rejects non-UUID', () => {
    const result = eventIdSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  it('accepts valid UUID', () => {
    const result = eventIdSchema.safeParse('11111111-1111-1111-1111-111111111111');
    expect(result.success).toBe(true);
  });
});

describe('updateEventStatusSchema', () => {
  it('rejects invalid eventId', () => {
    const result = updateEventStatusSchema.safeParse({ eventId: 'bad', newStatus: 'published' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown status', () => {
    const result = updateEventStatusSchema.safeParse({
      eventId: '11111111-1111-1111-1111-111111111111',
      newStatus: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid transition input', () => {
    const result = updateEventStatusSchema.safeParse({
      eventId: '11111111-1111-1111-1111-111111111111',
      newStatus: 'published',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all 5 valid statuses', () => {
    for (const status of EVENT_STATUSES) {
      const result = updateEventStatusSchema.safeParse({
        eventId: '11111111-1111-1111-1111-111111111111',
        newStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('EVENT_TRANSITIONS — blocked transitions', () => {
  it('draft cannot go to archived', () => {
    expect(EVENT_TRANSITIONS.draft).not.toContain('archived');
  });

  it('published cannot go to draft', () => {
    expect(EVENT_TRANSITIONS.published).not.toContain('draft');
  });

  it('completed cannot go to published', () => {
    expect(EVENT_TRANSITIONS.completed).not.toContain('published');
  });
});
