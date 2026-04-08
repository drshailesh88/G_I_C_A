import { z } from 'zod';

// ── Session types ─────────────────────────────────────────────
export const SESSION_TYPES = [
  'keynote', 'panel', 'workshop', 'free_paper', 'plenary',
  'symposium', 'break', 'lunch', 'registration', 'other',
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

// ── Session statuses ──────────────────────────────────────────
export const SESSION_STATUSES = ['draft', 'scheduled', 'completed', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['completed', 'cancelled'],
  completed: [],       // terminal
  cancelled: [],       // terminal
};

// ── Role types (shared: requirements + assignments) ───────────
export const ROLE_TYPES = [
  'speaker', 'chair', 'co_chair', 'moderator', 'panelist', 'discussant', 'presenter',
] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

// ── Faculty invite statuses ───────────────────────────────────
export const FACULTY_INVITE_STATUSES = ['sent', 'opened', 'accepted', 'declined', 'expired'] as const;
export type FacultyInviteStatus = (typeof FACULTY_INVITE_STATUSES)[number];

export const FACULTY_INVITE_TRANSITIONS: Record<FacultyInviteStatus, FacultyInviteStatus[]> = {
  sent: ['opened', 'accepted', 'declined', 'expired'],
  opened: ['accepted', 'declined', 'expired'],
  accepted: [],        // terminal
  declined: [],        // terminal
  expired: [],         // terminal
};

// ── Hall schemas ──────────────────────────────────────────────
export const createHallSchema = z.object({
  name: z.string().trim().min(1, 'Hall name is required').max(200),
  capacity: z.string().max(20).optional().or(z.literal('')),
  sortOrder: z.string().max(10).default('0'),
});

export const updateHallSchema = z.object({
  hallId: z.string().uuid('Invalid hall ID'),
  name: z.string().trim().min(1, 'Hall name is required').max(200).optional(),
  capacity: z.string().max(20).optional().or(z.literal('')),
  sortOrder: z.string().max(10).optional(),
});

export const hallIdSchema = z.string().uuid('Invalid hall ID');

// ── Session schemas ───────────────────────────────────────────
export const createSessionSchema = z.object({
  title: z.string().trim().min(1, 'Session title is required').max(300),
  description: z.string().max(5000).optional().or(z.literal('')),
  parentSessionId: z.string().uuid('Invalid parent session ID').optional().or(z.literal('')),
  sessionDate: z.string().min(1, 'Session date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  hallId: z.string().uuid('Invalid hall ID').optional().or(z.literal('')),
  sessionType: z.enum(SESSION_TYPES).default('other'),
  track: z.string().max(100).optional().or(z.literal('')),
  isPublic: z.boolean().default(true),
  cmeCredits: z.coerce.number().int().min(0).max(100).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
}).refine(
  (data) => {
    const start = new Date(`${data.sessionDate}T${data.startTime}`);
    const end = new Date(`${data.sessionDate}T${data.endTime}`);
    return end > start;
  },
  { message: 'End time must be after start time', path: ['endTime'] },
);

// Base shape without refinement — for partial updates
const sessionFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Session title is required').max(300),
  description: z.string().max(5000).optional().or(z.literal('')),
  parentSessionId: z.string().uuid('Invalid parent session ID').optional().or(z.literal('')),
  sessionDate: z.string().min(1, 'Session date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  hallId: z.string().uuid('Invalid hall ID').optional().or(z.literal('')),
  sessionType: z.enum(SESSION_TYPES),
  track: z.string().max(100).optional().or(z.literal('')),
  isPublic: z.boolean(),
  cmeCredits: z.coerce.number().int().min(0).max(100).optional(),
  sortOrder: z.coerce.number().int().min(0),
});

export const updateSessionSchema = sessionFieldsSchema.partial().extend({
  sessionId: z.string().uuid('Invalid session ID'),
});

export const updateSessionStatusSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  newStatus: z.enum(SESSION_STATUSES),
});

export const sessionIdSchema = z.string().uuid('Invalid session ID');

// ── Session role requirement schemas ──────────────────────────
export const createRoleRequirementSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  role: z.enum(ROLE_TYPES),
  requiredCount: z.coerce.number().int().min(1, 'Required count must be at least 1').max(50),
});

export const updateRoleRequirementSchema = z.object({
  requirementId: z.string().uuid('Invalid requirement ID'),
  requiredCount: z.coerce.number().int().min(1).max(50),
});

// ── Session assignment schemas ────────────────────────────────
export const createAssignmentSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  personId: z.string().uuid('Invalid person ID'),
  role: z.enum(ROLE_TYPES),
  sortOrder: z.coerce.number().int().min(0).default(0),
  presentationTitle: z.string().max(500).optional().or(z.literal('')),
  presentationDurationMinutes: z.coerce.number().int().min(1).max(480).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const updateAssignmentSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
  role: z.enum(ROLE_TYPES).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  presentationTitle: z.string().max(500).optional().or(z.literal('')),
  presentationDurationMinutes: z.coerce.number().int().min(1).max(480).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

// ── Faculty invite schemas ────────────────────────────────────
export const createFacultyInviteSchema = z.object({
  personId: z.string().uuid('Invalid person ID'),
});

export const updateFacultyInviteStatusSchema = z.object({
  inviteId: z.string().uuid('Invalid invite ID'),
  newStatus: z.enum(FACULTY_INVITE_STATUSES),
});

// ── Program version publish schema ────────────────────────────
export const publishProgramVersionSchema = z.object({
  changesDescription: z.string().max(2000).optional().or(z.literal('')),
  publishReason: z.string().max(500).optional().or(z.literal('')),
});

// ── Type exports ──────────────────────────────────────────────
export type CreateHallInput = z.infer<typeof createHallSchema>;
export type UpdateHallInput = z.infer<typeof updateHallSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type UpdateSessionStatusInput = z.infer<typeof updateSessionStatusSchema>;
export type CreateRoleRequirementInput = z.infer<typeof createRoleRequirementSchema>;
export type UpdateRoleRequirementInput = z.infer<typeof updateRoleRequirementSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type CreateFacultyInviteInput = z.infer<typeof createFacultyInviteSchema>;
export type UpdateFacultyInviteStatusInput = z.infer<typeof updateFacultyInviteStatusSchema>;
export type PublishProgramVersionInput = z.infer<typeof publishProgramVersionSchema>;
