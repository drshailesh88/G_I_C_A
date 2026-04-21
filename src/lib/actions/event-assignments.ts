'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { eventUserAssignments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasRole } from '@/lib/auth/session-role';
import { eventIdSchema } from '@/lib/validations/event';
import { withEventScope } from '@/lib/db/with-event-scope';
import {
  createEventAssignmentSchema,
  deactivateEventAssignmentSchema,
  type CreateEventAssignmentInput,
  type DeactivateEventAssignmentInput,
} from '@/lib/validations/event-assignments';

async function assertSuperAdmin(): Promise<string> {
  const session = await auth();
  const userId = session.userId;
  if (!userId) throw new Error('Not authenticated');
  if (!sessionHasRole(session, ROLES.SUPER_ADMIN)) {
    throw new Error('Forbidden: only Super Admin can manage event assignments');
  }
  return userId;
}

export type EventAssignment = {
  id: string;
  eventId: string;
  authUserId: string;
  assignmentType: string;
  isActive: boolean;
  assignedAt: Date;
  assignedBy: string;
};

export type AssignmentMutationResult = { ok: true } | { ok: false; error: string };

export async function getEventAssignments(eventId: string): Promise<EventAssignment[]> {
  await assertSuperAdmin();
  eventIdSchema.parse(eventId);

  return db
    .select({
      id: eventUserAssignments.id,
      eventId: eventUserAssignments.eventId,
      authUserId: eventUserAssignments.authUserId,
      assignmentType: eventUserAssignments.assignmentType,
      isActive: eventUserAssignments.isActive,
      assignedAt: eventUserAssignments.assignedAt,
      assignedBy: eventUserAssignments.assignedBy,
    })
    .from(eventUserAssignments)
    .where(withEventScope(eventUserAssignments.eventId, eventId));
}

export async function createEventAssignment(
  input: CreateEventAssignmentInput,
): Promise<AssignmentMutationResult> {
  const adminUserId = await assertSuperAdmin();

  const parsed = createEventAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { eventId, authUserId, assignmentType } = parsed.data;

  const [existing] = await db
    .select({ id: eventUserAssignments.id })
    .from(eventUserAssignments)
    .where(
      withEventScope(
        eventUserAssignments.eventId,
        eventId,
        eq(eventUserAssignments.authUserId, authUserId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(eventUserAssignments)
      .set({
        isActive: true,
        assignmentType,
        assignedBy: adminUserId,
        updatedAt: new Date(),
      })
      .where(eq(eventUserAssignments.id, existing.id));
  } else {
    await db.insert(eventUserAssignments).values({
      eventId,
      authUserId,
      assignmentType,
      assignedBy: adminUserId,
    });
  }

  revalidatePath(`/events/${eventId}/team`);
  return { ok: true };
}

export async function deactivateEventAssignment(
  input: DeactivateEventAssignmentInput,
): Promise<AssignmentMutationResult> {
  await assertSuperAdmin();

  const parsed = deactivateEventAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { eventId, authUserId } = parsed.data;

  await db
    .update(eventUserAssignments)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      withEventScope(
        eventUserAssignments.eventId,
        eventId,
        eq(eventUserAssignments.authUserId, authUserId),
      ),
    );

  revalidatePath(`/events/${eventId}/team`);
  return { ok: true };
}
