import { z } from 'zod';
import { eventIdSchema } from './event';

export const ASSIGNMENT_TYPES = ['owner', 'collaborator'] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

const authUserIdSchema = z.string().min(1, 'User ID is required');

export const createEventAssignmentSchema = z.object({
  eventId: eventIdSchema,
  authUserId: authUserIdSchema,
  assignmentType: z.enum(ASSIGNMENT_TYPES),
});

export const deactivateEventAssignmentSchema = z.object({
  eventId: eventIdSchema,
  authUserId: authUserIdSchema,
});

export type CreateEventAssignmentInput = z.infer<typeof createEventAssignmentSchema>;
export type DeactivateEventAssignmentInput = z.infer<typeof deactivateEventAssignmentSchema>;
