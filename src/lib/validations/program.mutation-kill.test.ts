import { describe, it, expect } from 'vitest';
import {
  createHallSchema,
  updateHallSchema,
  hallIdSchema,
  createSessionSchema,
  updateSessionSchema,
  updateSessionStatusSchema,
  sessionIdSchema,
  createRoleRequirementSchema,
  updateRoleRequirementSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  createFacultyInviteSchema,
  updateFacultyInviteStatusSchema,
  publishProgramVersionSchema,
  SESSION_TYPES,
  SESSION_STATUSES,
  SESSION_TRANSITIONS,
  ROLE_TYPES,
  FACULTY_INVITE_STATUSES,
  FACULTY_INVITE_TRANSITIONS,
} from './program';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '550e8400-e29b-41d4-a716-446655440001';

// ── StringLiteral: exact error messages ───────────────────────

describe('createHallSchema — exact error messages', () => {
  it('name empty → "Hall name is required"', () => {
    const r = createHallSchema.safeParse({ name: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Hall name is required');
    }
  });

  it('name max 200 chars: 200 passes, 201 fails', () => {
    const at200 = createHallSchema.safeParse({ name: 'A'.repeat(200) });
    expect(at200.success).toBe(true);
    const at201 = createHallSchema.safeParse({ name: 'A'.repeat(201) });
    expect(at201.success).toBe(false);
  });

  it('capacity max 20 chars: 20 passes, 21 fails', () => {
    const at20 = createHallSchema.safeParse({ name: 'H', capacity: '1'.repeat(20) });
    expect(at20.success).toBe(true);
    const at21 = createHallSchema.safeParse({ name: 'H', capacity: '1'.repeat(21) });
    expect(at21.success).toBe(false);
  });

  it('sortOrder max 10 chars: 10 passes, 11 fails', () => {
    const at10 = createHallSchema.safeParse({ name: 'H', sortOrder: '1'.repeat(10) });
    expect(at10.success).toBe(true);
    const at11 = createHallSchema.safeParse({ name: 'H', sortOrder: '1'.repeat(11) });
    expect(at11.success).toBe(false);
  });

  it('capacity accepts empty string (z.literal(""))', () => {
    const r = createHallSchema.safeParse({ name: 'H', capacity: '' });
    expect(r.success).toBe(true);
  });

  it('.trim() strips leading/trailing whitespace from name', () => {
    const r = createHallSchema.parse({ name: '  Hall A  ' });
    expect(r.name).toBe('Hall A');
  });

  it('sortOrder defaults to "0" when omitted', () => {
    const r = createHallSchema.parse({ name: 'H' });
    expect(r.sortOrder).toBe('0');
  });
});

describe('updateHallSchema — exact error messages and boundaries', () => {
  it('hallId invalid UUID → "Invalid hall ID"', () => {
    const r = updateHallSchema.safeParse({ hallId: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid hall ID');
    }
  });

  it('name .trim() strips whitespace', () => {
    const r = updateHallSchema.parse({ hallId: UUID, name: '  Updated  ' });
    expect(r.name).toBe('Updated');
  });

  it('name min(1) after trim rejects whitespace-only', () => {
    const r = updateHallSchema.safeParse({ hallId: UUID, name: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Hall name is required');
    }
  });

  it('name max 200: 200 passes, 201 fails', () => {
    expect(updateHallSchema.safeParse({ hallId: UUID, name: 'A'.repeat(200) }).success).toBe(true);
    expect(updateHallSchema.safeParse({ hallId: UUID, name: 'A'.repeat(201) }).success).toBe(false);
  });

  it('capacity max 20: boundary', () => {
    expect(updateHallSchema.safeParse({ hallId: UUID, capacity: 'x'.repeat(20) }).success).toBe(true);
    expect(updateHallSchema.safeParse({ hallId: UUID, capacity: 'x'.repeat(21) }).success).toBe(false);
  });

  it('sortOrder max 10: boundary', () => {
    expect(updateHallSchema.safeParse({ hallId: UUID, sortOrder: 'x'.repeat(10) }).success).toBe(true);
    expect(updateHallSchema.safeParse({ hallId: UUID, sortOrder: 'x'.repeat(11) }).success).toBe(false);
  });

  it('capacity accepts empty string', () => {
    const r = updateHallSchema.safeParse({ hallId: UUID, capacity: '' });
    expect(r.success).toBe(true);
  });
});

describe('hallIdSchema — exact error message', () => {
  it('rejects invalid UUID with "Invalid hall ID"', () => {
    const r = hallIdSchema.safeParse('not-a-uuid');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid hall ID');
    }
  });

  it('accepts valid UUID', () => {
    expect(hallIdSchema.safeParse(UUID).success).toBe(true);
  });
});

describe('createSessionSchema — exact error messages and boundaries', () => {
  const base = {
    title: 'Session',
    sessionDate: '2026-05-15',
    startTime: '09:00',
    endTime: '10:00',
  };

  it('title error → "Session title is required"', () => {
    const r = createSessionSchema.safeParse({ ...base, title: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Session title is required');
    }
  });

  it('title .trim() strips whitespace', () => {
    const r = createSessionSchema.parse({ ...base, title: '  Keynote  ' });
    expect(r.title).toBe('Keynote');
  });

  it('title max 300: 300 passes, 301 fails', () => {
    expect(createSessionSchema.safeParse({ ...base, title: 'A'.repeat(300) }).success).toBe(true);
    expect(createSessionSchema.safeParse({ ...base, title: 'A'.repeat(301) }).success).toBe(false);
  });

  it('description max 5000: boundary', () => {
    expect(createSessionSchema.safeParse({ ...base, description: 'x'.repeat(5000) }).success).toBe(true);
    expect(createSessionSchema.safeParse({ ...base, description: 'x'.repeat(5001) }).success).toBe(false);
  });

  it('description accepts empty string', () => {
    const r = createSessionSchema.safeParse({ ...base, description: '' });
    expect(r.success).toBe(true);
  });

  it('parentSessionId invalid UUID → "Invalid parent session ID"', () => {
    const r = createSessionSchema.safeParse({ ...base, parentSessionId: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('parentSessionId'))?.message;
      expect(msg).toBe('Invalid parent session ID');
    }
  });

  it('parentSessionId accepts empty string', () => {
    expect(createSessionSchema.safeParse({ ...base, parentSessionId: '' }).success).toBe(true);
  });

  it('sessionDate error → "Session date is required"', () => {
    const r = createSessionSchema.safeParse({ ...base, sessionDate: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('sessionDate'))?.message;
      expect(msg).toBe('Session date is required');
    }
  });

  it('sessionDate impossible calendar value is rejected', () => {
    const r = createSessionSchema.safeParse({ ...base, sessionDate: '2026-02-30' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('sessionDate'))?.message;
      expect(msg).toBe('Session date must be a valid date in YYYY-MM-DD format');
    }
  });

  it('startTime error → "Start time is required"', () => {
    const r = createSessionSchema.safeParse({ ...base, startTime: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('startTime'))?.message;
      expect(msg).toBe('Start time is required');
    }
  });

  it('startTime must use canonical HH:MM format', () => {
    const r = createSessionSchema.safeParse({ ...base, startTime: '09:00:00' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('startTime'))?.message;
      expect(msg).toBe('Start time must be in HH:MM 24-hour format');
    }
  });

  it('endTime error → "End time is required"', () => {
    const r = createSessionSchema.safeParse({ ...base, endTime: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('endTime'))?.message;
      expect(msg).toBe('End time is required');
    }
  });

  it('hallId invalid UUID → "Invalid hall ID"', () => {
    const r = createSessionSchema.safeParse({ ...base, hallId: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('hallId'))?.message;
      expect(msg).toBe('Invalid hall ID');
    }
  });

  it('hallId accepts empty string', () => {
    expect(createSessionSchema.safeParse({ ...base, hallId: '' }).success).toBe(true);
  });

  it('track max 100: boundary', () => {
    expect(createSessionSchema.safeParse({ ...base, track: 'x'.repeat(100) }).success).toBe(true);
    expect(createSessionSchema.safeParse({ ...base, track: 'x'.repeat(101) }).success).toBe(false);
  });

  it('track accepts empty string', () => {
    expect(createSessionSchema.safeParse({ ...base, track: '' }).success).toBe(true);
  });

  it('cmeCredits min 0: 0 passes, -1 fails', () => {
    expect(createSessionSchema.safeParse({ ...base, cmeCredits: 0 }).success).toBe(true);
    expect(createSessionSchema.safeParse({ ...base, cmeCredits: -1 }).success).toBe(false);
  });

  it('cmeCredits max 100: 100 passes, 101 fails', () => {
    expect(createSessionSchema.safeParse({ ...base, cmeCredits: 100 }).success).toBe(true);
    expect(createSessionSchema.safeParse({ ...base, cmeCredits: 101 }).success).toBe(false);
  });

  it('cmeCredits must be integer', () => {
    // coerce rounds, but let's check it produces an integer
    const r = createSessionSchema.parse({ ...base, cmeCredits: '5' });
    expect(r.cmeCredits).toBe(5);
  });

  it('sortOrder defaults to 0', () => {
    const r = createSessionSchema.parse(base);
    expect(r.sortOrder).toBe(0);
  });

  it('sortOrder min 0: 0 passes', () => {
    expect(createSessionSchema.safeParse({ ...base, sortOrder: 0 }).success).toBe(true);
  });

  it('isPublic defaults to true', () => {
    const r = createSessionSchema.parse(base);
    expect(r.isPublic).toBe(true);
  });

  it('isPublic can be set to false', () => {
    const r = createSessionSchema.parse({ ...base, isPublic: false });
    expect(r.isPublic).toBe(false);
  });

  it('sessionType defaults to "other"', () => {
    const r = createSessionSchema.parse(base);
    expect(r.sessionType).toBe('other');
  });

  it('refinement: end time must be after start time message', () => {
    const r = createSessionSchema.safeParse({ ...base, startTime: '10:00', endTime: '09:00' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('End time must be after start time');
      expect(r.error.issues[0].path).toContain('endTime');
    }
  });
});

describe('updateSessionSchema — boundaries', () => {
  it('sessionId invalid → "Invalid session ID"', () => {
    const r = updateSessionSchema.safeParse({ sessionId: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid session ID');
    }
  });

  it('title max 300 boundary', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, title: 'A'.repeat(300) }).success).toBe(true);
    expect(updateSessionSchema.safeParse({ sessionId: UUID, title: 'A'.repeat(301) }).success).toBe(false);
  });

  it('description accepts empty string on update', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, description: '' }).success).toBe(true);
  });

  it('parentSessionId accepts empty string on update', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, parentSessionId: '' }).success).toBe(true);
  });

  it('hallId accepts empty string on update', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, hallId: '' }).success).toBe(true);
  });

  it('track accepts empty string on update', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, track: '' }).success).toBe(true);
  });

  it('all session fields are optional in update', () => {
    const r = updateSessionSchema.safeParse({ sessionId: UUID });
    expect(r.success).toBe(true);
  });

  it('sessionDate impossible calendar value is rejected on update', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: UUID,
      sessionDate: '2026-02-30',
      startTime: '09:00',
      endTime: '10:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('sessionDate'))?.message;
      expect(msg).toBe('Session date must be a valid date in YYYY-MM-DD format');
    }
  });

  it('rejects schedule updates that omit sessionDate', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: UUID,
      startTime: '09:00',
      endTime: '10:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('sessionDate'))?.message;
      expect(msg).toBe('Session date is required when updating session time');
    }
  });

  it('rejects schedule updates that omit startTime or endTime', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: UUID,
      sessionDate: '2026-05-15',
      startTime: '09:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('endTime'))?.message;
      expect(msg).toBe('End time is required when updating session schedule');
    }
  });

  it('rejects reversed full schedule updates', () => {
    const r = updateSessionSchema.safeParse({
      sessionId: UUID,
      sessionDate: '2026-05-15',
      startTime: '10:00',
      endTime: '09:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('endTime'))?.message;
      expect(msg).toBe('End time must be after start time');
    }
  });
});

describe('updateSessionStatusSchema — exact messages', () => {
  it('sessionId invalid → "Invalid session ID"', () => {
    const r = updateSessionStatusSchema.safeParse({ sessionId: 'bad', newStatus: 'scheduled' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid session ID');
    }
  });
});

describe('sessionIdSchema — exact message', () => {
  it('invalid → "Invalid session ID"', () => {
    const r = sessionIdSchema.safeParse('bad');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid session ID');
    }
  });
});

describe('createRoleRequirementSchema — exact messages and boundaries', () => {
  it('sessionId invalid → "Invalid session ID"', () => {
    const r = createRoleRequirementSchema.safeParse({ sessionId: 'bad', role: 'speaker', requiredCount: 1 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid session ID');
    }
  });

  it('requiredCount min 1: 0 fails with "Required count must be at least 1"', () => {
    const r = createRoleRequirementSchema.safeParse({ sessionId: UUID, role: 'speaker', requiredCount: 0 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Required count must be at least 1');
    }
  });

  it('requiredCount max 50: 50 passes, 51 fails', () => {
    expect(createRoleRequirementSchema.safeParse({ sessionId: UUID, role: 'speaker', requiredCount: 50 }).success).toBe(true);
    expect(createRoleRequirementSchema.safeParse({ sessionId: UUID, role: 'speaker', requiredCount: 51 }).success).toBe(false);
  });

  it('requiredCount 1 (minimum) passes', () => {
    expect(createRoleRequirementSchema.safeParse({ sessionId: UUID, role: 'speaker', requiredCount: 1 }).success).toBe(true);
  });
});

describe('updateRoleRequirementSchema — exact messages', () => {
  it('requirementId invalid → "Invalid requirement ID"', () => {
    const r = updateRoleRequirementSchema.safeParse({ requirementId: 'bad', requiredCount: 1 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid requirement ID');
    }
  });

  it('requiredCount min 1, max 50 boundary', () => {
    expect(updateRoleRequirementSchema.safeParse({ requirementId: UUID, requiredCount: 1 }).success).toBe(true);
    expect(updateRoleRequirementSchema.safeParse({ requirementId: UUID, requiredCount: 50 }).success).toBe(true);
    expect(updateRoleRequirementSchema.safeParse({ requirementId: UUID, requiredCount: 0 }).success).toBe(false);
    expect(updateRoleRequirementSchema.safeParse({ requirementId: UUID, requiredCount: 51 }).success).toBe(false);
  });
});

describe('createAssignmentSchema — exact messages and boundaries', () => {
  it('sessionId invalid → "Invalid session ID"', () => {
    const r = createAssignmentSchema.safeParse({ sessionId: 'bad', personId: UUID, role: 'speaker' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('sessionId'))?.message;
      expect(msg).toBe('Invalid session ID');
    }
  });

  it('personId invalid → "Invalid person ID"', () => {
    const r = createAssignmentSchema.safeParse({ sessionId: UUID, personId: 'bad', role: 'speaker' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('personId'))?.message;
      expect(msg).toBe('Invalid person ID');
    }
  });

  it('presentationTitle max 500: boundary', () => {
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationTitle: 'x'.repeat(500) }).success).toBe(true);
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationTitle: 'x'.repeat(501) }).success).toBe(false);
  });

  it('presentationTitle accepts empty string', () => {
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationTitle: '' }).success).toBe(true);
  });

  it('presentationDurationMinutes min 1, max 480 boundary', () => {
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationDurationMinutes: 1 }).success).toBe(true);
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationDurationMinutes: 480 }).success).toBe(true);
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationDurationMinutes: 0 }).success).toBe(false);
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationDurationMinutes: 481 }).success).toBe(false);
  });

  it('notes max 2000: boundary', () => {
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', notes: 'x'.repeat(2000) }).success).toBe(true);
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', notes: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('notes accepts empty string', () => {
    expect(createAssignmentSchema.safeParse({ sessionId: UUID, personId: UUID2, role: 'speaker', notes: '' }).success).toBe(true);
  });

  it('sortOrder min 0: 0 passes', () => {
    const r = createAssignmentSchema.parse({ sessionId: UUID, personId: UUID2, role: 'speaker', sortOrder: 0 });
    expect(r.sortOrder).toBe(0);
  });

  it('sortOrder defaults to 0', () => {
    const r = createAssignmentSchema.parse({ sessionId: UUID, personId: UUID2, role: 'speaker' });
    expect(r.sortOrder).toBe(0);
  });
});

describe('updateAssignmentSchema — exact messages and boundaries', () => {
  it('assignmentId invalid → "Invalid assignment ID"', () => {
    const r = updateAssignmentSchema.safeParse({ assignmentId: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid assignment ID');
    }
  });

  it('presentationTitle max 500: boundary', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationTitle: 'x'.repeat(500) }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationTitle: 'x'.repeat(501) }).success).toBe(false);
  });

  it('presentationTitle accepts empty string', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationTitle: '' }).success).toBe(true);
  });

  it('presentationDurationMinutes min 1, max 480', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 1 }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 480 }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 0 }).success).toBe(false);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 481 }).success).toBe(false);
  });

  it('notes max 2000: boundary', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, notes: 'x'.repeat(2000) }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, notes: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('notes accepts empty string', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, notes: '' }).success).toBe(true);
  });

  it('sortOrder min 0: 0 passes', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, sortOrder: 0 }).success).toBe(true);
  });
});

describe('createFacultyInviteSchema — exact messages', () => {
  it('personId invalid → "Invalid person ID"', () => {
    const r = createFacultyInviteSchema.safeParse({ personId: 'bad' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Invalid person ID');
    }
  });
});

describe('updateFacultyInviteStatusSchema — exact messages', () => {
  it('inviteId invalid → "Invalid invite ID"', () => {
    const r = updateFacultyInviteStatusSchema.safeParse({ inviteId: 'bad', newStatus: 'accepted', token: 'abc' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('inviteId'))?.message;
      expect(msg).toBe('Invalid invite ID');
    }
  });

  it('token empty → "Token is required"', () => {
    const r = updateFacultyInviteStatusSchema.safeParse({ inviteId: UUID, newStatus: 'accepted', token: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.find(i => i.path.includes('token'))?.message;
      expect(msg).toBe('Token is required');
    }
  });
});

describe('publishProgramVersionSchema — boundaries', () => {
  it('changesDescription max 2000: boundary', () => {
    expect(publishProgramVersionSchema.safeParse({ changesDescription: 'x'.repeat(2000) }).success).toBe(true);
    expect(publishProgramVersionSchema.safeParse({ changesDescription: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('publishReason max 500: boundary', () => {
    expect(publishProgramVersionSchema.safeParse({ publishReason: 'x'.repeat(500) }).success).toBe(true);
    expect(publishProgramVersionSchema.safeParse({ publishReason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('changesDescription accepts empty string', () => {
    expect(publishProgramVersionSchema.safeParse({ changesDescription: '' }).success).toBe(true);
  });

  it('publishReason accepts empty string', () => {
    expect(publishProgramVersionSchema.safeParse({ publishReason: '' }).success).toBe(true);
  });
});

// ── Constant array contents ──────────────────────────────────

describe('SESSION_TYPES constant', () => {
  it('has exactly 10 session types', () => {
    expect(SESSION_TYPES).toHaveLength(10);
  });

  it('contains all expected types in order', () => {
    expect([...SESSION_TYPES]).toEqual([
      'keynote', 'panel', 'workshop', 'free_paper', 'plenary',
      'symposium', 'break', 'lunch', 'registration', 'other',
    ]);
  });
});

describe('SESSION_STATUSES constant', () => {
  it('has exactly 4 statuses', () => {
    expect(SESSION_STATUSES).toHaveLength(4);
  });

  it('contains all expected statuses', () => {
    expect([...SESSION_STATUSES]).toEqual(['draft', 'scheduled', 'completed', 'cancelled']);
  });
});

describe('ROLE_TYPES constant', () => {
  it('has exactly 7 role types', () => {
    expect(ROLE_TYPES).toHaveLength(7);
  });

  it('contains all expected types', () => {
    expect([...ROLE_TYPES]).toEqual([
      'speaker', 'chair', 'co_chair', 'moderator', 'panelist', 'discussant', 'presenter',
    ]);
  });
});

describe('FACULTY_INVITE_STATUSES constant', () => {
  it('has exactly 5 statuses', () => {
    expect(FACULTY_INVITE_STATUSES).toHaveLength(5);
  });

  it('contains all expected statuses', () => {
    expect([...FACULTY_INVITE_STATUSES]).toEqual(['sent', 'opened', 'accepted', 'declined', 'expired']);
  });
});

describe('SESSION_TRANSITIONS — exact allowed lists', () => {
  it('draft allows exactly [scheduled, cancelled]', () => {
    expect(SESSION_TRANSITIONS.draft).toEqual(['scheduled', 'cancelled']);
  });

  it('scheduled allows exactly [completed, cancelled]', () => {
    expect(SESSION_TRANSITIONS.scheduled).toEqual(['completed', 'cancelled']);
  });

  it('completed allows exactly []', () => {
    expect(SESSION_TRANSITIONS.completed).toEqual([]);
  });

  it('cancelled allows exactly []', () => {
    expect(SESSION_TRANSITIONS.cancelled).toEqual([]);
  });

  it('draft does NOT allow completed or draft', () => {
    expect(SESSION_TRANSITIONS.draft).not.toContain('completed');
    expect(SESSION_TRANSITIONS.draft).not.toContain('draft');
  });

  it('scheduled does NOT allow draft or scheduled', () => {
    expect(SESSION_TRANSITIONS.scheduled).not.toContain('draft');
    expect(SESSION_TRANSITIONS.scheduled).not.toContain('scheduled');
  });
});

describe('FACULTY_INVITE_TRANSITIONS — exact allowed lists', () => {
  it('sent allows exactly [opened, accepted, declined, expired]', () => {
    expect(FACULTY_INVITE_TRANSITIONS.sent).toEqual(['opened', 'accepted', 'declined', 'expired']);
  });

  it('opened allows exactly [accepted, declined, expired]', () => {
    expect(FACULTY_INVITE_TRANSITIONS.opened).toEqual(['accepted', 'declined', 'expired']);
  });

  it('accepted allows exactly []', () => {
    expect(FACULTY_INVITE_TRANSITIONS.accepted).toEqual([]);
  });

  it('declined allows exactly []', () => {
    expect(FACULTY_INVITE_TRANSITIONS.declined).toEqual([]);
  });

  it('expired allows exactly []', () => {
    expect(FACULTY_INVITE_TRANSITIONS.expired).toEqual([]);
  });
});
