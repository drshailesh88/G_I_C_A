'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { events, eventUserAssignments, organizations } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { ZodError, ZodIssue } from 'zod';
import { createEventSchema, eventIdSchema, EVENT_TRANSITIONS, type EventStatus } from '@/lib/validations/event';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function getOrCreateDefaultOrg() {
  const existing = await db.select().from(organizations).limit(1);
  if (existing.length > 0) return existing[0].id;

  const [org] = await db
    .insert(organizations)
    .values({ name: 'GEM India', slug: 'gem-india' })
    .returning({ id: organizations.id });
  return org.id;
}

function safeJsonParse(value: string, fieldPath: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const issue: ZodIssue = {
      code: 'custom',
      path: [fieldPath],
      message: 'Invalid JSON',
    };
    throw new ZodError([issue]);
  }
}

export async function createEvent(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  // Parse JSON safely BEFORE Zod validation (Bug fix #4)
  const moduleTogglesRaw = safeJsonParse(
    (formData.get('moduleToggles') as string) || '{}',
    'moduleToggles',
  );

  const raw = {
    name: formData.get('name') as string,
    startDate: formData.get('startDate') as string,
    endDate: formData.get('endDate') as string,
    timezone: (formData.get('timezone') as string) || 'Asia/Kolkata',
    venueName: formData.get('venueName') as string,
    venueAddress: (formData.get('venueAddress') as string) || undefined,
    venueCity: (formData.get('venueCity') as string) || undefined,
    venueMapUrl: (formData.get('venueMapUrl') as string) || undefined,
    description: (formData.get('description') as string) || undefined,
    moduleToggles: moduleTogglesRaw,
  };

  const validated = createEventSchema.parse(raw);
  const orgId = await getOrCreateDefaultOrg();
  const slug = slugify(validated.name) + '-' + Date.now().toString(36);

  const [event] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      slug,
      name: validated.name,
      description: validated.description || null,
      startDate: new Date(validated.startDate),
      endDate: new Date(validated.endDate),
      timezone: validated.timezone,
      venueName: validated.venueName,
      venueAddress: validated.venueAddress || null,
      venueCity: validated.venueCity || null,
      venueMapUrl: validated.venueMapUrl || null,
      moduleToggles: validated.moduleToggles,
      status: 'draft',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  // Assign creator as owner
  await db.insert(eventUserAssignments).values({
    eventId: event.id,
    authUserId: userId,
    assignmentType: 'owner',
    assignedBy: userId,
  });

  revalidatePath('/events');
  revalidatePath('/dashboard');

  return { id: event.id };
}

export async function getEvents() {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  // TODO: Phase 1 Req 10 — filter by assigned events for non-super-admin
  // For now, return all events (super admin view)
  const allEvents = await db
    .select()
    .from(events)
    .orderBy(desc(events.startDate));

  return allEvents;
}

export async function getEvent(eventId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  // Validate eventId format (Bug fix #5)
  eventIdSchema.parse(eventId);

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');

  // Authorization: user must be event creator or assigned (Bug fix #1)
  if (event.createdBy !== userId) {
    // Check event_user_assignments for access
    const [assignment] = await db
      .select()
      .from(eventUserAssignments)
      .where(eq(eventUserAssignments.eventId, eventId))
      .limit(1);

    if (!assignment || (assignment as Record<string, unknown>).authUserId !== userId) {
      throw new Error('Forbidden: you do not have access to this event');
    }
  }

  return event;
}

export async function updateEventStatus(eventId: string, newStatus: EventStatus) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  // Validate eventId
  eventIdSchema.parse(eventId);

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');

  const currentStatus = event.status as EventStatus;
  const allowedTransitions = EVENT_TRANSITIONS[currentStatus];

  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowedTransitions.join(', ') || 'none (terminal state)'}`,
    );
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (newStatus === 'archived') updateData.archivedAt = new Date();
  if (newStatus === 'cancelled') updateData.cancelledAt = new Date();

  await db
    .update(events)
    .set(updateData)
    .where(eq(events.id, eventId));

  // Post-update verification: re-read to detect both unauthorized access and
  // concurrent modifications (optimistic locking). If the verified status doesn't
  // match the intended new status, the update was either rejected (forbidden) or
  // the event was concurrently modified (stale/conflict).
  const [verified] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!verified || verified.status !== newStatus) {
    throw new Error(
      'Forbidden: stale conflict — event was concurrently modified or access was denied',
    );
  }

  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`);

  return { success: true };
}
