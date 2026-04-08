import { z } from 'zod';

// Valid lifecycle states
export const EVENT_STATUSES = ['draft', 'published', 'completed', 'archived', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// Valid state transitions
export const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['completed', 'cancelled'],
  completed: ['archived'],
  archived: [],         // terminal
  cancelled: [],        // terminal
};

// Module toggle keys
export const MODULE_KEYS = [
  'scientific_program',
  'registration',
  'travel_accommodation',
  'certificates',
  'qr_checkin',
  'transport_planning',
  'communications',
] as const;

export const moduleTogglesSchema = z.object(
  Object.fromEntries(MODULE_KEYS.map((key) => [key, z.boolean().default(true)])) as Record<
    (typeof MODULE_KEYS)[number],
    z.ZodDefault<z.ZodBoolean>
  >,
);

export const createEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(200),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  timezone: z.string().default('Asia/Kolkata'),
  venueName: z.string().trim().min(1, 'Venue is required').max(300),
  venueAddress: z.string().max(500).optional(),
  venueCity: z.string().max(100).optional(),
  venueMapUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
  moduleToggles: moduleTogglesSchema,
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: 'End date must be on or after start date', path: ['endDate'] },
);

export const eventIdSchema = z.string().uuid('Invalid event ID');

export const updateEventStatusSchema = z.object({
  eventId: eventIdSchema,
  newStatus: z.enum(EVENT_STATUSES),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventStatusInput = z.infer<typeof updateEventStatusSchema>;
