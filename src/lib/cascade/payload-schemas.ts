import { z } from 'zod';

const cascadeActorSchema = z.object({
  type: z.enum(['user', 'system']),
  id: z.string(),
});

export const cascadeEventDataSchema = z.object({
  eventId: z.string().min(1),
  actor: cascadeActorSchema,
  payload: z.record(z.unknown()),
});

export type CascadeEventData = z.infer<typeof cascadeEventDataSchema>;
