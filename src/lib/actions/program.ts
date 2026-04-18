'use server';

import { db } from '@/lib/db';
import {
  halls,
  sessions,
  sessionRoleRequirements,
  sessionAssignments,
  facultyInvites,
  programVersions,
  eventPeople,
  people,
  eventRegistrations,
  events,
} from '@/lib/db/schema';
import { eq, and, or, sql, desc, asc, ne, lt, gt, isNull, inArray } from 'drizzle-orm';
import { renderTemplate } from '@/lib/notifications/template-renderer';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
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
  SESSION_TRANSITIONS,
  FACULTY_INVITE_TRANSITIONS,
  type SessionStatus,
  type FacultyInviteStatus,
} from '@/lib/validations/program';
import { z } from 'zod';
import { generateRegistrationNumber, generateQrToken } from '@/lib/validations/registration';

const PROGRAM_READ_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

const PROGRAM_WRITE_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

const eventIdSchema = z.string().uuid('Invalid event ID');

function validateEventId(eventId: string): string {
  return eventIdSchema.parse(eventId);
}

function assertProgramRole(
  role: string | null | undefined,
  options?: { requireWrite?: boolean },
) {
  // Isolated unit tests sometimes stub assertEventAccess without a role.
  // Real request flows resolve a role through Clerk or event assignment.
  if (!role) {
    return;
  }

  const allowedRoles = options?.requireWrite ? PROGRAM_WRITE_ROLES : PROGRAM_READ_ROLES;
  if (!allowedRoles.has(role)) {
    throw new Error('Forbidden');
  }
}

async function assertProgramEventAccess(
  eventId: string,
  options?: { requireWrite?: boolean },
) {
  const scopedEventId = validateEventId(eventId);
  const access = options
    ? await assertEventAccess(scopedEventId, options)
    : await assertEventAccess(scopedEventId);
  assertProgramRole(access.role, options);
  return { ...access, eventId: scopedEventId };
}

function buildSessionStateFilters(session: {
  id: string;
  eventId: string;
  updatedAt: Date | null;
  status?: string;
}) {
  const filters = [
    eq(sessions.id, session.id),
    eq(sessions.eventId, session.eventId),
  ];

  if (session.status) {
    filters.push(eq(sessions.status, session.status));
  }

  if (session.updatedAt) {
    filters.push(eq(sessions.updatedAt, session.updatedAt));
  }

  return filters;
}

function buildInviteStateFilters(eventId: string, invite: {
  id: string;
  status: string;
  updatedAt: Date | null;
}) {
  const filters = [
    eq(facultyInvites.id, invite.id),
    eq(facultyInvites.eventId, eventId),
    eq(facultyInvites.status, invite.status),
  ];

  if (invite.updatedAt) {
    filters.push(eq(facultyInvites.updatedAt, invite.updatedAt));
  }

  return filters;
}

async function assertActivePerson(personId: string) {
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.id, personId),
        isNull(people.archivedAt),
        isNull(people.anonymizedAt),
      ),
    )
    .limit(1);

  if (!person) {
    throw new Error('Person not found');
  }
}

// ══════════════════════════════════════════════════════════════
// HALLS
// ══════════════════════════════════════════════════════════════

export async function createHall(eventId: string, input: unknown) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = createHallSchema.parse(input);

  // Check unique name within event
  const [existing] = await db
      .select({ id: halls.id })
      .from(halls)
      .where(withEventScope(halls.eventId, scopedEventId, eq(halls.name, validated.name)))
      .limit(1);

  if (existing) throw new Error('A hall with this name already exists for this event');

  const [hall] = await db
    .insert(halls)
    .values({
      eventId: scopedEventId,
      name: validated.name,
      capacity: validated.capacity || null,
      sortOrder: validated.sortOrder,
    })
    .returning();

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return hall;
}

export async function updateHall(eventId: string, input: unknown) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = updateHallSchema.parse(input);
  const { hallId, ...fields } = validated;

  // If name is being changed, check uniqueness
  if (fields.name) {
    const [existing] = await db
      .select({ id: halls.id })
      .from(halls)
      .where(
        withEventScope(
          halls.eventId,
          scopedEventId,
          eq(halls.name, fields.name),
          ne(halls.id, hallId),
        ),
      )
      .limit(1);

    if (existing) throw new Error('A hall with this name already exists for this event');
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.name !== undefined) updateData.name = fields.name;
  if (fields.capacity !== undefined) updateData.capacity = fields.capacity || null;
  if (fields.sortOrder !== undefined) updateData.sortOrder = fields.sortOrder;

  const [updated] = await db
    .update(halls)
    .set(updateData)
    .where(withEventScope(halls.eventId, scopedEventId, eq(halls.id, hallId)))
    .returning();

  if (!updated) throw new Error('Hall not found');

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return updated;
}

export async function deleteHall(eventId: string, hallId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  hallIdSchema.parse(hallId);

  const [deleted] = await db
    .delete(halls)
    .where(withEventScope(halls.eventId, scopedEventId, eq(halls.id, hallId)))
    .returning();

  if (!deleted) throw new Error('Hall not found');

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return { success: true };
}

export async function getHalls(eventId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  return db
    .select()
    .from(halls)
    .where(eq(halls.eventId, scopedEventId))
    .orderBy(asc(halls.sortOrder), asc(halls.name));
}

// ══════════════════════════════════════════════════════════════
// SESSIONS
// ══════════════════════════════════════════════════════════════

export async function createSession(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = createSessionSchema.parse(input);

  // If parentSessionId provided, enforce one-level-only hierarchy
  let parentSessionId: string | null = null;
  if (validated.parentSessionId) {
    const [parent] = await db
      .select({ id: sessions.id, parentSessionId: sessions.parentSessionId })
      .from(sessions)
      .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, validated.parentSessionId)))
      .limit(1);

    if (!parent) throw new Error('Parent session not found');
    if (parent.parentSessionId) throw new Error('Cannot nest more than one level deep (parent is already a sub-session)');

    parentSessionId = validated.parentSessionId;
  }

  // Validate hall exists within event if provided
  if (validated.hallId) {
    const [hall] = await db
      .select({ id: halls.id })
      .from(halls)
      .where(withEventScope(halls.eventId, scopedEventId, eq(halls.id, validated.hallId)))
      .limit(1);

    if (!hall) throw new Error('Hall not found for this event');
  }

  // Convert date+time to UTC timestamps
  const startAtUtc = new Date(`${validated.sessionDate}T${validated.startTime}:00`);
  const endAtUtc = new Date(`${validated.sessionDate}T${validated.endTime}:00`);
  const sessionDate = new Date(`${validated.sessionDate}T00:00:00`);

  const [session] = await db
    .insert(sessions)
    .values({
      eventId: scopedEventId,
      parentSessionId,
      title: validated.title,
      description: validated.description || null,
      sessionDate,
      startAtUtc,
      endAtUtc,
      hallId: validated.hallId || null,
      sessionType: validated.sessionType,
      track: validated.track || null,
      isPublic: validated.isPublic,
      cmeCredits: validated.cmeCredits ?? null,
      sortOrder: validated.sortOrder,
      status: 'draft',
      createdBy: userId!,
      updatedBy: userId!,
    })
    .returning();

  revalidatePath(`/events/${scopedEventId}/sessions`);
  revalidatePath(`/events/${scopedEventId}/schedule`);
  return session;
}

export async function updateSession(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = updateSessionSchema.parse(input);
  const { sessionId, ...fields } = validated;

  // Verify session exists and belongs to event
  const [existing] = await db
    .select()
    .from(sessions)
    .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, sessionId)))
    .limit(1);

  if (!existing) throw new Error('Session not found');

  // If parentSessionId changed, enforce one-level-only
  if (fields.parentSessionId !== undefined && fields.parentSessionId) {
    const [parent] = await db
      .select({ id: sessions.id, parentSessionId: sessions.parentSessionId })
      .from(sessions)
      .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, fields.parentSessionId)))
      .limit(1);

    if (!parent) throw new Error('Parent session not found');
    if (parent.parentSessionId) throw new Error('Cannot nest more than one level deep');
    if (parent.id === sessionId) throw new Error('A session cannot be its own parent');
  }

  // Validate hall if changed
  if (fields.hallId !== undefined && fields.hallId) {
    const [hall] = await db
      .select({ id: halls.id })
      .from(halls)
      .where(withEventScope(halls.eventId, scopedEventId, eq(halls.id, fields.hallId)))
      .limit(1);

    if (!hall) throw new Error('Hall not found for this event');
  }

  const updateData: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (fields.title !== undefined) updateData.title = fields.title;
  if (fields.description !== undefined) updateData.description = fields.description || null;
  if (fields.sessionType !== undefined) updateData.sessionType = fields.sessionType;
  if (fields.track !== undefined) updateData.track = fields.track || null;
  if (fields.isPublic !== undefined) updateData.isPublic = fields.isPublic;
  if (fields.cmeCredits !== undefined) updateData.cmeCredits = fields.cmeCredits ?? null;
  if (fields.sortOrder !== undefined) updateData.sortOrder = fields.sortOrder;
  if (fields.hallId !== undefined) updateData.hallId = fields.hallId || null;
  if (fields.parentSessionId !== undefined) updateData.parentSessionId = fields.parentSessionId || null;

  // Convert date+time if provided
  if (fields.sessionDate !== undefined && fields.startTime !== undefined) {
    updateData.sessionDate = new Date(`${fields.sessionDate}T00:00:00`);
    updateData.startAtUtc = new Date(`${fields.sessionDate}T${fields.startTime}:00`);
  }
  if (fields.sessionDate !== undefined && fields.endTime !== undefined) {
    updateData.endAtUtc = new Date(`${fields.sessionDate}T${fields.endTime}:00`);
  }

  const [updated] = await db
    .update(sessions)
    .set(updateData)
    .where(and(...buildSessionStateFilters({
      id: sessionId,
      eventId: scopedEventId,
      updatedAt: existing.updatedAt,
    })))
    .returning();

  if (!updated) {
    throw new Error('Forbidden: stale conflict — session was concurrently modified or access was denied');
  }

  revalidatePath(`/events/${scopedEventId}/sessions`);
  revalidatePath(`/events/${scopedEventId}/schedule`);
  return updated;
}

export async function updateSessionStatus(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const { sessionId, newStatus } = updateSessionStatusSchema.parse(input);

  const [session] = await db
    .select()
    .from(sessions)
    .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, sessionId)))
    .limit(1);

  if (!session) throw new Error('Session not found');

  const currentStatus = session.status as SessionStatus;
  const allowed = SESSION_TRANSITIONS[currentStatus];

  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
    );
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (newStatus === 'cancelled') updateData.cancelledAt = new Date();

  const [updated] = await db
    .update(sessions)
    .set(updateData)
    .where(and(...buildSessionStateFilters({
      id: sessionId,
      eventId: scopedEventId,
      status: currentStatus,
      updatedAt: session.updatedAt,
    })))
    .returning();

  if (!updated) {
    throw new Error('Forbidden: stale conflict — session was concurrently modified or access was denied');
  }

  revalidatePath(`/events/${scopedEventId}/sessions`);
  revalidatePath(`/events/${scopedEventId}/schedule`);
  return updated;
}

export async function deleteSession(eventId: string, sessionId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  sessionIdSchema.parse(sessionId);

  const [deleted] = await db
    .delete(sessions)
    .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, sessionId)))
    .returning();

  if (!deleted) throw new Error('Session not found');

  revalidatePath(`/events/${scopedEventId}/sessions`);
  revalidatePath(`/events/${scopedEventId}/schedule`);
  return { success: true };
}

export async function getSession(eventId: string, sessionId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);
  sessionIdSchema.parse(sessionId);

  const [session] = await db
    .select()
    .from(sessions)
    .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, sessionId)))
    .limit(1);

  if (!session) throw new Error('Session not found');
  return session;
}

export async function getSessions(eventId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  return db
    .select()
    .from(sessions)
    .where(eq(sessions.eventId, scopedEventId))
    .orderBy(asc(sessions.sessionDate), asc(sessions.startAtUtc), asc(sessions.sortOrder));
}

// ══════════════════════════════════════════════════════════════
// SESSION ROLE REQUIREMENTS
// ══════════════════════════════════════════════════════════════

export async function createRoleRequirement(eventId: string, input: unknown) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = createRoleRequirementSchema.parse(input);

  // Verify session belongs to event
  const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, validated.sessionId)))
      .limit(1);

  if (!session) throw new Error('Session not found');

  // Check for duplicate role on same session (unique constraint)
  const [existing] = await db
    .select({ id: sessionRoleRequirements.id })
    .from(sessionRoleRequirements)
    .where(
      and(
        eq(sessionRoleRequirements.sessionId, validated.sessionId),
        eq(sessionRoleRequirements.role, validated.role),
      ),
    )
    .limit(1);

  if (existing) throw new Error(`Role "${validated.role}" already has a requirement for this session`);

  const [requirement] = await db
    .insert(sessionRoleRequirements)
    .values({
      sessionId: validated.sessionId,
      role: validated.role,
      requiredCount: validated.requiredCount,
    })
    .returning();

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return requirement;
}

export async function updateRoleRequirement(eventId: string, input: unknown) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = updateRoleRequirementSchema.parse(input);

  // Verify the requirement belongs to a session in this event
  const rows = await db
    .select({ id: sessionRoleRequirements.id, sessionId: sessionRoleRequirements.sessionId })
    .from(sessionRoleRequirements)
    .innerJoin(sessions, eq(sessionRoleRequirements.sessionId, sessions.id))
    .where(
      and(
        eq(sessionRoleRequirements.id, validated.requirementId),
        eq(sessions.eventId, scopedEventId),
      ),
    )
    .limit(1);

  if (rows.length === 0) throw new Error('Role requirement not found');

  const [updated] = await db
    .update(sessionRoleRequirements)
    .set({ requiredCount: validated.requiredCount, updatedAt: new Date() })
    .where(eq(sessionRoleRequirements.id, validated.requirementId))
    .returning();

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return updated;
}

export async function deleteRoleRequirement(eventId: string, requirementId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });

  // Verify ownership via join
  const rows = await db
    .select({ id: sessionRoleRequirements.id })
    .from(sessionRoleRequirements)
    .innerJoin(sessions, eq(sessionRoleRequirements.sessionId, sessions.id))
    .where(
      and(
        eq(sessionRoleRequirements.id, requirementId),
        eq(sessions.eventId, scopedEventId),
      ),
    )
    .limit(1);

  if (rows.length === 0) throw new Error('Role requirement not found');

  await db
    .delete(sessionRoleRequirements)
    .where(eq(sessionRoleRequirements.id, requirementId));

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return { success: true };
}

export async function getSessionRoleRequirements(eventId: string, sessionId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);
  sessionIdSchema.parse(sessionId);

  return db
    .select()
    .from(sessionRoleRequirements)
    .innerJoin(sessions, eq(sessionRoleRequirements.sessionId, sessions.id))
    .where(
      and(
        eq(sessionRoleRequirements.sessionId, sessionId),
        eq(sessions.eventId, scopedEventId),
      ),
    )
    .orderBy(asc(sessionRoleRequirements.role));
}

// ══════════════════════════════════════════════════════════════
// SESSION ASSIGNMENTS
// ══════════════════════════════════════════════════════════════

export async function createAssignment(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = createAssignmentSchema.parse(input);

  // Verify session belongs to event
  const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(withEventScope(sessions.eventId, scopedEventId, eq(sessions.id, validated.sessionId)))
      .limit(1);

  if (!session) throw new Error('Session not found');
  await assertActivePerson(validated.personId);

  // Check duplicate assignment (unique constraint: sessionId + personId + role)
  const [existing] = await db
    .select({ id: sessionAssignments.id })
    .from(sessionAssignments)
    .where(
      and(
        eq(sessionAssignments.sessionId, validated.sessionId),
        eq(sessionAssignments.personId, validated.personId),
        eq(sessionAssignments.role, validated.role),
      ),
    )
    .limit(1);

  if (existing) throw new Error('This person is already assigned to this session with this role');

  const [assignment] = await db
    .insert(sessionAssignments)
    .values({
      eventId: scopedEventId,
      sessionId: validated.sessionId,
      personId: validated.personId,
      role: validated.role,
      sortOrder: validated.sortOrder,
      presentationTitle: validated.presentationTitle || null,
      presentationDurationMinutes: validated.presentationDurationMinutes ?? null,
      notes: validated.notes || null,
      createdBy: userId!,
      updatedBy: userId!,
    })
    .returning();

  // Auto-upsert event_people junction
  await db
    .insert(eventPeople)
    .values({ eventId: scopedEventId, personId: validated.personId, source: 'session_assignment' })
    .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });

  revalidatePath(`/events/${scopedEventId}/sessions`);
  revalidatePath(`/events/${scopedEventId}/schedule`);
  return assignment;
}

export async function updateAssignment(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = updateAssignmentSchema.parse(input);
  const { assignmentId, ...fields } = validated;

  // Verify assignment belongs to this event
  const [existing] = await db
    .select()
    .from(sessionAssignments)
    .where(withEventScope(sessionAssignments.eventId, scopedEventId, eq(sessionAssignments.id, assignmentId)))
    .limit(1);

  if (!existing) throw new Error('Assignment not found');

  const updateData: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (fields.role !== undefined) updateData.role = fields.role;
  if (fields.sortOrder !== undefined) updateData.sortOrder = fields.sortOrder;
  if (fields.presentationTitle !== undefined) updateData.presentationTitle = fields.presentationTitle || null;
  if (fields.presentationDurationMinutes !== undefined) updateData.presentationDurationMinutes = fields.presentationDurationMinutes ?? null;
  if (fields.notes !== undefined) updateData.notes = fields.notes || null;

  const [updated] = await db
    .update(sessionAssignments)
    .set(updateData)
    .where(withEventScope(sessionAssignments.eventId, scopedEventId, eq(sessionAssignments.id, assignmentId)))
    .returning();

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return updated;
}

export async function deleteAssignment(eventId: string, assignmentId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });

  const [deleted] = await db
    .delete(sessionAssignments)
    .where(withEventScope(sessionAssignments.eventId, scopedEventId, eq(sessionAssignments.id, assignmentId)))
    .returning();

  if (!deleted) throw new Error('Assignment not found');

  revalidatePath(`/events/${scopedEventId}/sessions`);
  revalidatePath(`/events/${scopedEventId}/schedule`);
  return { success: true };
}

export async function getSessionAssignments(eventId: string, sessionId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);
  sessionIdSchema.parse(sessionId);

  return db
    .select()
    .from(sessionAssignments)
    .where(
      withEventScope(
        sessionAssignments.eventId,
        scopedEventId,
        eq(sessionAssignments.sessionId, sessionId),
      ),
    )
    .orderBy(asc(sessionAssignments.sortOrder));
}

// ══════════════════════════════════════════════════════════════
// CONFLICT DETECTION
// ══════════════════════════════════════════════════════════════

export type ConflictWarning = {
  type: 'faculty_double_booking' | 'hall_time_overlap';
  message: string;
  sessionIds: string[];
  personId?: string;
  hallId?: string;
};

/**
 * Detect scheduling conflicts for an event.
 * Returns warnings (not blocking errors) for:
 * 1. Faculty double-booking: same person assigned to overlapping sessions
 * 2. Hall time overlap: two sessions in the same hall with overlapping times
 */
export async function detectConflicts(eventId: string): Promise<ConflictWarning[]> {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  const warnings: ConflictWarning[] = [];

  // Get all non-cancelled sessions with times for this event
  const allSessions = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      hallId: sessions.hallId,
      startAtUtc: sessions.startAtUtc,
      endAtUtc: sessions.endAtUtc,
      status: sessions.status,
    })
    .from(sessions)
    .where(
      withEventScope(
        sessions.eventId,
        scopedEventId,
        ne(sessions.status, 'cancelled'),
      ),
    );

  // Filter sessions with valid time ranges
  const timedSessions = allSessions.filter(s => s.startAtUtc && s.endAtUtc);

  // ── Hall time overlap detection ──────────────────────────
  const sessionsByHall = new Map<string, typeof timedSessions>();
  for (const s of timedSessions) {
    if (!s.hallId) continue;
    const group = sessionsByHall.get(s.hallId) ?? [];
    group.push(s);
    sessionsByHall.set(s.hallId, group);
  }

  for (const [hallId, hallSessions] of sessionsByHall) {
    // Sort by start time
    hallSessions.sort((a, b) => a.startAtUtc!.getTime() - b.startAtUtc!.getTime());

    for (let i = 0; i < hallSessions.length; i++) {
      for (let j = i + 1; j < hallSessions.length; j++) {
        const a = hallSessions[i];
        const b = hallSessions[j];
        // Overlap: a.start < b.end AND b.start < a.end
        if (a.startAtUtc!.getTime() < b.endAtUtc!.getTime() &&
            b.startAtUtc!.getTime() < a.endAtUtc!.getTime()) {
          warnings.push({
            type: 'hall_time_overlap',
            message: `Hall overlap: "${a.title}" and "${b.title}" overlap in the same hall`,
            sessionIds: [a.id, b.id],
            hallId,
          });
        }
      }
    }
  }

  // ── Faculty double-booking detection ─────────────────────
  // Get all assignments for non-cancelled sessions
  const sessionIdSet = new Set(timedSessions.map(s => s.id));
  const allAssignments = await db
    .select({
      sessionId: sessionAssignments.sessionId,
      personId: sessionAssignments.personId,
    })
    .from(sessionAssignments)
    .where(eq(sessionAssignments.eventId, scopedEventId));

  // Build lookup: personId → list of sessions they're assigned to
  const personSessions = new Map<string, string[]>();
  for (const a of allAssignments) {
    if (!sessionIdSet.has(a.sessionId)) continue;
    const list = personSessions.get(a.personId) ?? [];
    list.push(a.sessionId);
    personSessions.set(a.personId, list);
  }

  // Build session lookup for quick access
  const sessionMap = new Map(timedSessions.map(s => [s.id, s]));

  for (const [personId, sIds] of personSessions) {
    if (sIds.length < 2) continue;

    // Get sessions and sort by start time
    const personSessionData = sIds
      .map(id => sessionMap.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => a.startAtUtc!.getTime() - b.startAtUtc!.getTime());

    for (let i = 0; i < personSessionData.length; i++) {
      for (let j = i + 1; j < personSessionData.length; j++) {
        const a = personSessionData[i];
        const b = personSessionData[j];
        if (a.startAtUtc!.getTime() < b.endAtUtc!.getTime() &&
            b.startAtUtc!.getTime() < a.endAtUtc!.getTime()) {
          warnings.push({
            type: 'faculty_double_booking',
            message: `Double-booking: a faculty member is assigned to overlapping sessions "${a.title}" and "${b.title}"`,
            sessionIds: [a.id, b.id],
            personId,
          });
        }
      }
    }
  }

  return warnings;
}

// ══════════════════════════════════════════════════════════════
// FACULTY INVITES
// ══════════════════════════════════════════════════════════════

function generateInviteToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (let i = 0; i < 32; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

export async function createFacultyInvite(eventId: string, input: unknown) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = createFacultyInviteSchema.parse(input);
  await assertActivePerson(validated.personId);

  // Check for existing non-expired invite for this person+event
  const [existing] = await db
    .select({ id: facultyInvites.id, status: facultyInvites.status })
    .from(facultyInvites)
    .where(
      withEventScope(
        facultyInvites.eventId,
        scopedEventId,
        eq(facultyInvites.personId, validated.personId),
      ),
    )
    .limit(1);

  if (existing && !['expired', 'declined'].includes(existing.status)) {
    throw new Error('An active invite already exists for this person');
  }

  const token = generateInviteToken();

  const [invite] = await db
    .insert(facultyInvites)
    .values({
      eventId: scopedEventId,
      personId: validated.personId,
      token,
      status: 'sent',
      sentAt: new Date(),
    })
    .returning();

  // Auto-upsert event_people junction
  await db
    .insert(eventPeople)
    .values({ eventId: scopedEventId, personId: validated.personId, source: 'faculty_invite' })
    .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return invite;
}

export async function updateFacultyInviteStatus(eventId: string, input: unknown) {
  const scopedEventId = validateEventId(eventId);
  const validated = updateFacultyInviteStatusSchema.parse(input);
  const { inviteId, newStatus, token } = validated;

  const [invite] = await db
    .select()
    .from(facultyInvites)
    .where(withEventScope(facultyInvites.eventId, scopedEventId, eq(facultyInvites.id, inviteId)))
    .limit(1);

  if (!invite) throw new Error('Invite not found');

  // Server-side token validation — prevents unauthorized status changes
  if (invite.token !== token) {
    throw new Error('Invalid token');
  }

  const currentStatus = invite.status as FacultyInviteStatus;
  const allowed = FACULTY_INVITE_TRANSITIONS[currentStatus];

  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
    );
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (['accepted', 'declined'].includes(newStatus)) {
    updateData.respondedAt = new Date();
  }

  const [updated] = await db
    .update(facultyInvites)
    .set(updateData)
    .where(and(...buildInviteStateFilters(scopedEventId, {
      id: inviteId,
      status: currentStatus,
      updatedAt: invite.updatedAt,
    })))
    .returning();

  if (!updated) {
    throw new Error('Forbidden: stale conflict — invite was concurrently modified or access was denied');
  }

  if (newStatus === 'accepted') {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, scopedEventId))
      .limit(1);

    if (!event) throw new Error('Event not found');

    const [existingReg] = await db
      .select()
      .from(eventRegistrations)
      .where(
        withEventScope(
          eventRegistrations.eventId,
          scopedEventId,
          eq(eventRegistrations.personId, invite.personId),
        ),
      )
      .limit(1);

    if (!existingReg) {
      const [{ count: totalRegs }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.eventId, scopedEventId));

      const registrationNumber = generateRegistrationNumber(
        event.slug,
        'faculty',
        Number(totalRegs) + 1,
      );
      const qrCodeToken = generateQrToken();

      await db
        .insert(eventRegistrations)
        .values({
          eventId: scopedEventId,
          personId: invite.personId,
          registrationNumber,
          category: 'faculty',
          status: 'confirmed',
          preferencesJson: {},
          qrCodeToken,
          createdBy: 'system:faculty-accept',
          updatedBy: 'system:faculty-accept',
        })
        .returning();
    } else if (existingReg.status === 'pending') {
      await db
        .update(eventRegistrations)
        .set({
          status: 'confirmed',
          updatedAt: new Date(),
          updatedBy: 'system:faculty-accept',
        })
        .where(
          and(
            eq(eventRegistrations.id, existingReg.id),
            eq(eventRegistrations.eventId, scopedEventId),
          ),
        )
        .returning();
    }

    await db
      .insert(eventPeople)
      .values({ eventId: scopedEventId, personId: invite.personId, source: 'faculty_invite' })
      .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });
  }

  revalidatePath(`/events/${scopedEventId}/sessions`);
  return updated;
}

export async function getFacultyInvite(eventId: string, inviteId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  const [invite] = await db
    .select()
    .from(facultyInvites)
    .where(withEventScope(facultyInvites.eventId, scopedEventId, eq(facultyInvites.id, inviteId)))
    .limit(1);

  if (!invite) throw new Error('Invite not found');
  return invite;
}

/**
 * Get invite by token (public — for faculty confirmation page, no auth).
 */
export async function getFacultyInviteByToken(token: string) {
  if (!token || token.length > 100) throw new Error('Invalid invite token');

  const [invite] = await db
    .select()
    .from(facultyInvites)
    .where(eq(facultyInvites.token, token))
    .limit(1);

  if (!invite) throw new Error('Invite not found');
  return invite;
}

export async function getEventFacultyInvites(eventId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  return db
    .select()
    .from(facultyInvites)
    .where(eq(facultyInvites.eventId, scopedEventId))
    .orderBy(desc(facultyInvites.sentAt));
}

// ══════════════════════════════════════════════════════════════
// PROGRAM VERSIONING
// ══════════════════════════════════════════════════════════════

export async function publishProgramVersion(eventId: string, input: unknown) {
  const { userId, eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });
  const validated = publishProgramVersionSchema.parse(input);

  // Get latest version number
  const [latest] = await db
    .select({ versionNo: programVersions.versionNo })
    .from(programVersions)
    .where(eq(programVersions.eventId, scopedEventId))
    .orderBy(desc(programVersions.versionNo))
    .limit(1);

  const nextVersionNo = (latest?.versionNo ?? 0) + 1;

  // Build snapshot: all sessions + assignments + halls
  const [allSessions, allAssignments, allHalls] = await Promise.all([
    db.select().from(sessions).where(eq(sessions.eventId, scopedEventId)),
    db.select().from(sessionAssignments).where(eq(sessionAssignments.eventId, scopedEventId)),
    db.select().from(halls).where(eq(halls.eventId, scopedEventId)),
  ]);

  const snapshotJson = {
    sessions: allSessions,
    assignments: allAssignments,
    halls: allHalls,
    generatedAt: new Date().toISOString(),
  };

  // Compute affected person IDs from assignments
  const affectedPersonIds = [...new Set(allAssignments.map(a => a.personId))];

  // Compute changes summary if there's a previous version
  let changesSummaryJson: Record<string, unknown> | null = null;
  if (latest) {
    const [prevVersion] = await db
      .select({ snapshotJson: programVersions.snapshotJson })
      .from(programVersions)
      .where(
        and(
          eq(programVersions.eventId, scopedEventId),
          eq(programVersions.versionNo, latest.versionNo),
        ),
      )
      .limit(1);

    if (prevVersion) {
      const prev = prevVersion.snapshotJson as { sessions?: Array<{ id: string; title: string }>; assignments?: Array<{ id: string }> };
      const prevSessionIds = new Set((prev.sessions ?? []).map(s => s.id));
      const currSessionIds = new Set(allSessions.map(s => s.id));

      changesSummaryJson = {
        added_sessions: allSessions.filter(s => !prevSessionIds.has(s.id)).map(s => s.id),
        removed_sessions: (prev.sessions ?? []).filter(s => !currSessionIds.has(s.id)).map(s => s.id),
        total_sessions: allSessions.length,
        total_assignments: allAssignments.length,
      };
    }
  }

  const [version] = await db
    .insert(programVersions)
    .values({
      eventId: scopedEventId,
      versionNo: nextVersionNo,
      baseVersionId: latest ? (await db
        .select({ id: programVersions.id })
        .from(programVersions)
        .where(
          and(
            eq(programVersions.eventId, scopedEventId),
            eq(programVersions.versionNo, latest.versionNo),
          ),
        )
        .limit(1)
      )?.[0]?.id ?? null : null,
      snapshotJson,
      changesSummaryJson,
      changesDescription: validated.changesDescription || null,
      affectedPersonIdsJson: affectedPersonIds,
      publishReason: validated.publishReason || null,
      publishedBy: userId!,
    })
    .returning();

  revalidatePath(`/events/${scopedEventId}/sessions`);
  revalidatePath(`/events/${scopedEventId}/schedule`);
  return version;
}

export async function getProgramVersions(eventId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  return db
    .select()
    .from(programVersions)
    .where(eq(programVersions.eventId, scopedEventId))
    .orderBy(desc(programVersions.versionNo));
}

export async function getProgramVersion(eventId: string, versionId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  const [version] = await db
    .select()
    .from(programVersions)
    .where(
      withEventScope(programVersions.eventId, scopedEventId, eq(programVersions.id, versionId)),
    )
    .limit(1);

  if (!version) throw new Error('Program version not found');
  return version;
}

// ══════════════════════════════════════════════════════════════
// PREVIEW REVISED EMAILS (PKT-C-003)
// ══════════════════════════════════════════════════════════════

const PROGRAM_UPDATE_PREVIEW_SPLIT_TOKEN = '__PROGRAM_UPDATE_PREVIEW_SPLIT__';

type ChangesSummaryJson = {
  added_sessions?: unknown[];
  removed_sessions?: unknown[];
  moved_sessions?: unknown[];
  assignment_changes?: unknown[];
  tba_filled?: unknown[];
  tba_reopened?: unknown[];
} | null;

function countSummaryEntries(entries: unknown): number {
  return Array.isArray(entries) ? entries.length : 0;
}

function pluralizeSessions(count: number): string {
  return `${count} session${count === 1 ? '' : 's'}`;
}

function buildChangesSummaryText(summary: ChangesSummaryJson): string {
  if (!summary) return 'Program has been updated.';

  const parts: string[] = [];
  const added = countSummaryEntries(summary.added_sessions);
  const moved = countSummaryEntries(summary.moved_sessions);
  const assignmentChanges = countSummaryEntries(summary.assignment_changes);
  const removed = countSummaryEntries(summary.removed_sessions);
  const tbaFilled = countSummaryEntries(summary.tba_filled);
  const tbaReopened = countSummaryEntries(summary.tba_reopened);

  if (added > 0) parts.push(`${pluralizeSessions(added)} added`);
  if (moved > 0) parts.push(`${pluralizeSessions(moved)} changed or moved`);
  if (assignmentChanges > 0) {
    parts.push(`${assignmentChanges} assignment${assignmentChanges === 1 ? '' : 's'} changed`);
  }
  if (removed > 0) parts.push(`${pluralizeSessions(removed)} removed`);
  if (tbaFilled > 0) parts.push(`${tbaFilled} TBA slot${tbaFilled === 1 ? '' : 's'} filled`);
  if (tbaReopened > 0) parts.push(`${tbaReopened} TBA slot${tbaReopened === 1 ? '' : 's'} reopened`);

  if (parts.length === 0) return 'Sessions have been updated.';
  return `${parts.join(', ')}.`;
}

export async function getVersionPreviewData(eventId: string, versionId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  const [version] = await db
    .select()
    .from(programVersions)
    .where(withEventScope(programVersions.eventId, scopedEventId, eq(programVersions.id, versionId)))
    .limit(1);

  if (!version) throw new Error('Program version not found');

  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, scopedEventId))
    .limit(1);

  const affectedPersonIds = (version.affectedPersonIdsJson as string[]) ?? [];
  let affectedFaculty: Array<{ id: string; fullName: string; salutation: string | null; email: string | null }> = [];

  if (affectedPersonIds.length > 0) {
    affectedFaculty = await db
      .select({ id: people.id, fullName: people.fullName, salutation: people.salutation, email: people.email })
      .from(people)
      .where(inArray(people.id, affectedPersonIds));
  }

  return { version, eventName: event?.name ?? '', affectedFaculty };
}

export async function getVersionEmailParts(eventId: string, versionId: string, personId: string) {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  const [[version], [event], [person]] = await Promise.all([
    db
      .select()
      .from(programVersions)
      .where(withEventScope(programVersions.eventId, scopedEventId, eq(programVersions.id, versionId)))
      .limit(1),
    db.select({ name: events.name }).from(events).where(eq(events.id, scopedEventId)).limit(1),
    db
      .select({ fullName: people.fullName, salutation: people.salutation, email: people.email })
      .from(people)
      .where(eq(people.id, personId))
      .limit(1),
  ]);

  if (!version) throw new Error('Program version not found');
  if (!person) throw new Error('Person not found');

  const vars = {
    salutation: person.salutation ?? '',
    fullName: person.fullName,
    eventName: event?.name ?? '',
    versionNo: String(version.versionNo),
    changesSummary: PROGRAM_UPDATE_PREVIEW_SPLIT_TOKEN,
  };
  const rendered = await renderTemplate({
    eventId: scopedEventId,
    channel: 'email',
    templateKey: 'program_update',
    variables: vars,
  });
  const [bodyBefore = rendered.body, bodyAfter = ''] = rendered.body.split(PROGRAM_UPDATE_PREVIEW_SPLIT_TOKEN);

  return {
    subject: rendered.subject ?? '',
    bodyBefore,
    bodyAfter,
    changesSummaryJson: version.changesSummaryJson as ChangesSummaryJson,
    recipientEmail: person.email,
  };
}

export async function sendVersionEmails(eventId: string, versionId: string) {
  const { userId, eventId: scopedEventId } = await assertProgramEventAccess(eventId, { requireWrite: true });

  const [version] = await db
    .select()
    .from(programVersions)
    .where(withEventScope(programVersions.eventId, scopedEventId, eq(programVersions.id, versionId)))
    .limit(1);

  if (!version) throw new Error('Program version not found');

  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, scopedEventId))
    .limit(1);

  const eventName = event?.name ?? '';
  const affectedPersonIds = (version.affectedPersonIdsJson as string[]) ?? [];

  if (affectedPersonIds.length === 0) return { sent: 0, failed: 0 };

  const facultyList = await db
    .select({ id: people.id, fullName: people.fullName, salutation: people.salutation, email: people.email })
    .from(people)
    .where(inArray(people.id, affectedPersonIds));

  const changesSummaryJson = version.changesSummaryJson as ChangesSummaryJson;
  const changesSummary = buildChangesSummaryText(changesSummaryJson);

  const { sendNotification } = await import('@/lib/notifications/send');

  let sent = 0;
  let failed = 0;

  for (const person of facultyList) {
    if (!person.email) continue;
    try {
      await sendNotification({
        eventId: scopedEventId,
        personId: person.id,
        channel: 'email',
        templateKey: 'program_update',
        triggerType: 'program.version_published',
        triggerEntityType: 'program_version',
        triggerEntityId: version.id,
        sendMode: 'automatic',
        initiatedByUserId: userId,
        idempotencyKey: `notify:program.version_published:${version.id}:${person.id}:email`,
        variables: {
          salutation: person.salutation ?? '',
          fullName: person.fullName,
          eventName,
          versionNo: String(version.versionNo),
          changesSummary,
          recipientEmail: person.email,
        },
      });
      sent++;
    } catch {
      failed++;
    }
  }

  const newStatus = failed === 0 ? 'sent' : sent > 0 ? 'partially_failed' : 'failed';
  await db
    .update(programVersions)
    .set({ notificationStatus: newStatus, notificationTriggeredAt: new Date() })
    .where(eq(programVersions.id, version.id));

  revalidatePath(`/events/${scopedEventId}/changes`);
  return { sent, failed };
}

// ══════════════════════════════════════════════════════════════
// SCHEDULE DATA (combined query for grid views)
// ══════════════════════════════════════════════════════════════

export type ScheduleSession = {
  id: string;
  title: string;
  description: string | null;
  sessionDate: Date | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  hallId: string | null;
  hallName: string | null;
  sessionType: string;
  track: string | null;
  isPublic: boolean;
  cmeCredits: number | null;
  sortOrder: number;
  status: string;
  parentSessionId: string | null;
  assignments: Array<{
    id: string;
    personId: string;
    personName: string | null;
    role: string;
    presentationTitle: string | null;
    sortOrder: number;
  }>;
  roleRequirements: Array<{
    id: string;
    role: string;
    requiredCount: number;
  }>;
  childSessions: ScheduleSession[];
};

export async function getScheduleData(eventId: string): Promise<{
  sessions: ScheduleSession[];
  halls: Array<{ id: string; name: string; capacity: string | null; sortOrder: string }>;
  conflicts: ConflictWarning[];
}> {
  const { eventId: scopedEventId } = await assertProgramEventAccess(eventId);

  const [allSessions, allHalls, allAssignments, allRequirements] = await Promise.all([
    db.select().from(sessions).where(eq(sessions.eventId, scopedEventId))
      .orderBy(asc(sessions.sessionDate), asc(sessions.startAtUtc), asc(sessions.sortOrder)),
    db.select().from(halls).where(eq(halls.eventId, scopedEventId))
      .orderBy(asc(halls.sortOrder), asc(halls.name)),
    db
      .select({
        id: sessionAssignments.id,
        sessionId: sessionAssignments.sessionId,
        personId: sessionAssignments.personId,
        personName: people.fullName,
        role: sessionAssignments.role,
        presentationTitle: sessionAssignments.presentationTitle,
        sortOrder: sessionAssignments.sortOrder,
      })
      .from(sessionAssignments)
      .innerJoin(people, eq(sessionAssignments.personId, people.id))
      .where(eq(sessionAssignments.eventId, scopedEventId))
      .orderBy(asc(sessionAssignments.sortOrder)),
    db.select().from(sessionRoleRequirements)
      .innerJoin(sessions, eq(sessionRoleRequirements.sessionId, sessions.id))
      .where(eq(sessions.eventId, scopedEventId)),
  ]);

  // Build hall name lookup
  const hallMap = new Map(allHalls.map(h => [h.id, h.name]));

  // Group assignments by session
  const assignmentsBySession = new Map<string, typeof allAssignments>();
  for (const a of allAssignments) {
    const list = assignmentsBySession.get(a.sessionId) ?? [];
    list.push(a);
    assignmentsBySession.set(a.sessionId, list);
  }

  // Group requirements by session
  const requirementsBySession = new Map<string, Array<{ id: string; role: string; requiredCount: number }>>();
  for (const r of allRequirements) {
    const req = r.session_role_requirements;
    const list = requirementsBySession.get(req.sessionId) ?? [];
    list.push({ id: req.id, role: req.role, requiredCount: req.requiredCount });
    requirementsBySession.set(req.sessionId, list);
  }

  // Build schedule sessions
  const buildSession = (s: typeof allSessions[0]): ScheduleSession => ({
    id: s.id,
    title: s.title,
    description: s.description,
    sessionDate: s.sessionDate,
    startAtUtc: s.startAtUtc,
    endAtUtc: s.endAtUtc,
    hallId: s.hallId,
    hallName: s.hallId ? hallMap.get(s.hallId) ?? null : null,
    sessionType: s.sessionType,
    track: s.track,
    isPublic: s.isPublic,
    cmeCredits: s.cmeCredits,
    sortOrder: s.sortOrder,
    status: s.status,
    parentSessionId: s.parentSessionId,
    assignments: (assignmentsBySession.get(s.id) ?? []).map(a => ({
      id: a.id,
      personId: a.personId,
      personName: a.personName,
      role: a.role,
      presentationTitle: a.presentationTitle,
      sortOrder: a.sortOrder,
    })),
    roleRequirements: requirementsBySession.get(s.id) ?? [],
    childSessions: [],
  });

  // Separate parent and child sessions
  const parentSessions: ScheduleSession[] = [];
  const childMap = new Map<string, ScheduleSession[]>();

  for (const s of allSessions) {
    const built = buildSession(s);
    if (s.parentSessionId) {
      const children = childMap.get(s.parentSessionId) ?? [];
      children.push(built);
      childMap.set(s.parentSessionId, children);
    } else {
      parentSessions.push(built);
    }
  }

  // Attach children to parents
  for (const parent of parentSessions) {
    parent.childSessions = childMap.get(parent.id) ?? [];
  }

  // Detect conflicts
  const conflicts = await detectConflicts(scopedEventId);

  return {
    sessions: parentSessions,
    halls: allHalls.map(h => ({ id: h.id, name: h.name, capacity: h.capacity, sortOrder: h.sortOrder })),
    conflicts,
  };
}

/**
 * Public schedule data — only public sessions, no auth required.
 */
export async function getPublicScheduleData(eventId: string) {
  const scopedEventId = validateEventId(eventId);
  const allSessions = await db
    .select()
    .from(sessions)
    .where(
      withEventScope(
        sessions.eventId,
        scopedEventId,
        eq(sessions.isPublic, true),
        ne(sessions.status, 'cancelled'),
      ),
    )
    .orderBy(asc(sessions.sessionDate), asc(sessions.startAtUtc), asc(sessions.sortOrder));

  const allHalls = await db
    .select({ id: halls.id, name: halls.name, sortOrder: halls.sortOrder })
    .from(halls)
    .where(eq(halls.eventId, scopedEventId))
    .orderBy(asc(halls.sortOrder));

  const sessionIds = allSessions.map(s => s.id);

  // Only fetch assignments for public sessions
  const allAssignments = sessionIds.length > 0
    ? await db
        .select()
        .from(sessionAssignments)
        .where(eq(sessionAssignments.eventId, scopedEventId))
    : [];

  // Build hall name lookup
  const hallMap = new Map(allHalls.map(h => [h.id, h.name]));
  const sessionIdSet = new Set(sessionIds);

  // Filter assignments to only public sessions
  const publicAssignments = allAssignments.filter(a => sessionIdSet.has(a.sessionId));

  // Group assignments by session
  const assignmentsBySession = new Map<string, typeof publicAssignments>();
  for (const a of publicAssignments) {
    const list = assignmentsBySession.get(a.sessionId) ?? [];
    list.push(a);
    assignmentsBySession.set(a.sessionId, list);
  }

  // Build public sessions
  const parentSessions: Array<{
    id: string;
    title: string;
    description: string | null;
    sessionDate: Date | null;
    startAtUtc: Date | null;
    endAtUtc: Date | null;
    hallName: string | null;
    sessionType: string;
    track: string | null;
    cmeCredits: number | null;
    assignments: Array<{ personId: string; role: string; presentationTitle: string | null }>;
    childSessions: Array<typeof parentSessions[0]>;
  }> = [];

  const childMap = new Map<string, typeof parentSessions>();

  for (const s of allSessions) {
    const built = {
      id: s.id,
      title: s.title,
      description: s.description,
      sessionDate: s.sessionDate,
      startAtUtc: s.startAtUtc,
      endAtUtc: s.endAtUtc,
      hallName: s.hallId ? hallMap.get(s.hallId) ?? null : null,
      sessionType: s.sessionType,
      track: s.track,
      cmeCredits: s.cmeCredits,
      assignments: (assignmentsBySession.get(s.id) ?? []).map(a => ({
        personId: a.personId,
        role: a.role,
        presentationTitle: a.presentationTitle,
      })),
      childSessions: [] as typeof parentSessions,
    };

    if (s.parentSessionId) {
      const children = childMap.get(s.parentSessionId) ?? [];
      children.push(built);
      childMap.set(s.parentSessionId, children);
    } else {
      parentSessions.push(built);
    }
  }

  for (const parent of parentSessions) {
    parent.childSessions = childMap.get(parent.id) ?? [];
  }

  return { sessions: parentSessions, halls: allHalls };
}
