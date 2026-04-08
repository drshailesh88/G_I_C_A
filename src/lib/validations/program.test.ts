import { describe, it, expect } from 'vitest';
import {
  createHallSchema,
  updateHallSchema,
  createSessionSchema,
  updateSessionSchema,
  updateSessionStatusSchema,
  createRoleRequirementSchema,
  updateRoleRequirementSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  createFacultyInviteSchema,
  updateFacultyInviteStatusSchema,
  publishProgramVersionSchema,
  SESSION_TRANSITIONS,
  FACULTY_INVITE_TRANSITIONS,
  type SessionStatus,
  type FacultyInviteStatus,
} from './program';

// ── Hall validations ──────────────────────────────────────────
describe('createHallSchema', () => {
  it('accepts valid input', () => {
    const result = createHallSchema.safeParse({ name: 'Hall A', capacity: '500' });
    expect(result.success).toBe(true);
  });

  it('accepts name only (capacity optional)', () => {
    const result = createHallSchema.safeParse({ name: 'Main Auditorium' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createHallSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    const result = createHallSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('defaults sortOrder to "0"', () => {
    const result = createHallSchema.parse({ name: 'Hall B' });
    expect(result.sortOrder).toBe('0');
  });
});

describe('updateHallSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts partial update with hallId', () => {
    const result = updateHallSchema.safeParse({ hallId: uuid, capacity: '300' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid hallId', () => {
    const result = updateHallSchema.safeParse({ hallId: 'not-a-uuid', name: 'X' });
    expect(result.success).toBe(false);
  });
});

// ── Session validations ───────────────────────────────────────
describe('createSessionSchema', () => {
  const validInput = {
    title: 'Keynote: AI in Medicine',
    sessionDate: '2026-05-15',
    startTime: '09:00',
    endTime: '10:30',
    sessionType: 'keynote' as const,
  };

  it('accepts valid input', () => {
    const result = createSessionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = createSessionSchema.safeParse({ ...validInput, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only title', () => {
    const result = createSessionSchema.safeParse({ ...validInput, title: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects end time before start time', () => {
    const result = createSessionSchema.safeParse({
      ...validInput,
      startTime: '10:30',
      endTime: '09:00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('endTime');
    }
  });

  it('rejects equal start and end time', () => {
    const result = createSessionSchema.safeParse({
      ...validInput,
      startTime: '09:00',
      endTime: '09:00',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid parent session ID', () => {
    const result = createSessionSchema.safeParse({
      ...validInput,
      parentSessionId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty parentSessionId', () => {
    const result = createSessionSchema.safeParse({ ...validInput, parentSessionId: '' });
    expect(result.success).toBe(true);
  });

  it('defaults sessionType to other', () => {
    const { sessionType: _, ...noType } = validInput;
    const result = createSessionSchema.parse({ ...noType, sessionDate: '2026-05-15', startTime: '09:00', endTime: '10:00' });
    expect(result.sessionType).toBe('other');
  });

  it('defaults isPublic to true', () => {
    const result = createSessionSchema.parse(validInput);
    expect(result.isPublic).toBe(true);
  });

  it('accepts optional CME credits', () => {
    const result = createSessionSchema.safeParse({ ...validInput, cmeCredits: 2 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cmeCredits).toBe(2);
  });

  it('rejects negative CME credits', () => {
    const result = createSessionSchema.safeParse({ ...validInput, cmeCredits: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid session type', () => {
    const result = createSessionSchema.safeParse({ ...validInput, sessionType: 'invalid_type' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid session types', () => {
    const types = ['keynote', 'panel', 'workshop', 'free_paper', 'plenary', 'symposium', 'break', 'lunch', 'registration', 'other'] as const;
    for (const t of types) {
      const result = createSessionSchema.safeParse({ ...validInput, sessionType: t });
      expect(result.success).toBe(true);
    }
  });
});

describe('updateSessionSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts partial update with sessionId', () => {
    const result = updateSessionSchema.safeParse({ sessionId: uuid, title: 'New Title' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid sessionId', () => {
    const result = updateSessionSchema.safeParse({ sessionId: 'bad', title: 'X' });
    expect(result.success).toBe(false);
  });

  it('accepts sessionId only (no fields to update)', () => {
    const result = updateSessionSchema.safeParse({ sessionId: uuid });
    expect(result.success).toBe(true);
  });
});

describe('updateSessionStatusSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid transition', () => {
    const result = updateSessionStatusSchema.safeParse({ sessionId: uuid, newStatus: 'scheduled' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateSessionStatusSchema.safeParse({ sessionId: uuid, newStatus: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('SESSION_TRANSITIONS', () => {
  it('draft can transition to scheduled or cancelled', () => {
    expect(SESSION_TRANSITIONS.draft).toContain('scheduled');
    expect(SESSION_TRANSITIONS.draft).toContain('cancelled');
    expect(SESSION_TRANSITIONS.draft).not.toContain('completed');
  });

  it('scheduled can transition to completed or cancelled', () => {
    expect(SESSION_TRANSITIONS.scheduled).toContain('completed');
    expect(SESSION_TRANSITIONS.scheduled).toContain('cancelled');
  });

  it('completed is terminal', () => {
    expect(SESSION_TRANSITIONS.completed).toEqual([]);
  });

  it('cancelled is terminal', () => {
    expect(SESSION_TRANSITIONS.cancelled).toEqual([]);
  });

  it('every status has a transitions entry', () => {
    const statuses: SessionStatus[] = ['draft', 'scheduled', 'completed', 'cancelled'];
    for (const s of statuses) {
      expect(SESSION_TRANSITIONS).toHaveProperty(s);
    }
  });
});

// ── Role requirement validations ──────────────────────────────
describe('createRoleRequirementSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid input', () => {
    const result = createRoleRequirementSchema.safeParse({
      sessionId: uuid,
      role: 'speaker',
      requiredCount: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects count of 0', () => {
    const result = createRoleRequirementSchema.safeParse({
      sessionId: uuid,
      role: 'chair',
      requiredCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = createRoleRequirementSchema.safeParse({
      sessionId: uuid,
      role: 'invalid_role',
      requiredCount: 1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid role types', () => {
    const roles = ['speaker', 'chair', 'co_chair', 'moderator', 'panelist', 'discussant', 'presenter'] as const;
    for (const r of roles) {
      const result = createRoleRequirementSchema.safeParse({ sessionId: uuid, role: r, requiredCount: 1 });
      expect(result.success).toBe(true);
    }
  });
});

describe('updateRoleRequirementSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid update', () => {
    const result = updateRoleRequirementSchema.safeParse({ requirementId: uuid, requiredCount: 5 });
    expect(result.success).toBe(true);
  });

  it('rejects count over 50', () => {
    const result = updateRoleRequirementSchema.safeParse({ requirementId: uuid, requiredCount: 51 });
    expect(result.success).toBe(false);
  });
});

// ── Assignment validations ────────────────────────────────────
describe('createAssignmentSchema', () => {
  const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
  const uuid2 = '550e8400-e29b-41d4-a716-446655440001';

  it('accepts valid input', () => {
    const result = createAssignmentSchema.safeParse({
      sessionId: uuid1,
      personId: uuid2,
      role: 'speaker',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional presentation fields', () => {
    const result = createAssignmentSchema.safeParse({
      sessionId: uuid1,
      personId: uuid2,
      role: 'presenter',
      presentationTitle: 'Novel Techniques in Cardiac Surgery',
      presentationDurationMinutes: 15,
      notes: 'Will bring own slides',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing personId', () => {
    const result = createAssignmentSchema.safeParse({
      sessionId: uuid1,
      role: 'speaker',
    });
    expect(result.success).toBe(false);
  });

  it('defaults sortOrder to 0', () => {
    const result = createAssignmentSchema.parse({
      sessionId: uuid1,
      personId: uuid2,
      role: 'chair',
    });
    expect(result.sortOrder).toBe(0);
  });

  it('rejects presentation duration over 480 minutes', () => {
    const result = createAssignmentSchema.safeParse({
      sessionId: uuid1,
      personId: uuid2,
      role: 'speaker',
      presentationDurationMinutes: 500,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateAssignmentSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts partial update', () => {
    const result = updateAssignmentSchema.safeParse({
      assignmentId: uuid,
      presentationTitle: 'Updated Title',
    });
    expect(result.success).toBe(true);
  });
});

// ── Faculty invite validations ────────────────────────────────
describe('createFacultyInviteSchema', () => {
  it('accepts valid personId', () => {
    const result = createFacultyInviteSchema.safeParse({
      personId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid personId', () => {
    const result = createFacultyInviteSchema.safeParse({ personId: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('updateFacultyInviteStatusSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid status', () => {
    const result = updateFacultyInviteStatusSchema.safeParse({
      inviteId: uuid,
      newStatus: 'accepted',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateFacultyInviteStatusSchema.safeParse({
      inviteId: uuid,
      newStatus: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('FACULTY_INVITE_TRANSITIONS', () => {
  it('sent can transition to opened, accepted, declined, expired', () => {
    expect(FACULTY_INVITE_TRANSITIONS.sent).toContain('opened');
    expect(FACULTY_INVITE_TRANSITIONS.sent).toContain('accepted');
    expect(FACULTY_INVITE_TRANSITIONS.sent).toContain('declined');
    expect(FACULTY_INVITE_TRANSITIONS.sent).toContain('expired');
  });

  it('opened can transition to accepted, declined, expired', () => {
    expect(FACULTY_INVITE_TRANSITIONS.opened).toContain('accepted');
    expect(FACULTY_INVITE_TRANSITIONS.opened).toContain('declined');
    expect(FACULTY_INVITE_TRANSITIONS.opened).toContain('expired');
    expect(FACULTY_INVITE_TRANSITIONS.opened).not.toContain('sent');
  });

  it('accepted is terminal', () => {
    expect(FACULTY_INVITE_TRANSITIONS.accepted).toEqual([]);
  });

  it('declined is terminal', () => {
    expect(FACULTY_INVITE_TRANSITIONS.declined).toEqual([]);
  });

  it('expired is terminal', () => {
    expect(FACULTY_INVITE_TRANSITIONS.expired).toEqual([]);
  });

  it('every status has a transitions entry', () => {
    const statuses: FacultyInviteStatus[] = ['sent', 'opened', 'accepted', 'declined', 'expired'];
    for (const s of statuses) {
      expect(FACULTY_INVITE_TRANSITIONS).toHaveProperty(s);
    }
  });
});

// ── Program version publish schema ────────────────────────────
describe('publishProgramVersionSchema', () => {
  it('accepts empty input', () => {
    const result = publishProgramVersionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts description and reason', () => {
    const result = publishProgramVersionSchema.safeParse({
      changesDescription: 'Added keynote speaker',
      publishReason: 'Schedule finalized',
    });
    expect(result.success).toBe(true);
  });

  it('rejects description over 2000 chars', () => {
    const result = publishProgramVersionSchema.safeParse({
      changesDescription: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
