'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { events, eventUserAssignments, organizations } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { ZodError, ZodIssue } from 'zod';
import { createEventSchema, eventIdSchema, EVENT_TRANSITIONS, type EventStatus } from '@/lib/validations/event';
import { assertEventAccess, getEventListContext } from '@/lib/auth/event-access';
import { withEventScope } from '@/lib/db/with-event-scope';

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
  const { userId, isSuperAdmin } = await getEventListContext();
  if (!userId) throw new Error('Unauthorized');

  // REQ 10: Super Admin sees all events; others see only assigned events
  if (isSuperAdmin) {
    return db
      .select()
      .from(events)
      .orderBy(desc(events.startDate));
  }

  // Non-super-admin: JOIN with event_user_assignments to filter by assignment
  const rows = await db
    .select({
      id: events.id,
      organizationId: events.organizationId,
      slug: events.slug,
      name: events.name,
      description: events.description,
      startDate: events.startDate,
      endDate: events.endDate,
      timezone: events.timezone,
      status: events.status,
      archivedAt: events.archivedAt,
      cancelledAt: events.cancelledAt,
      venueName: events.venueName,
      venueAddress: events.venueAddress,
      venueCity: events.venueCity,
      venueMapUrl: events.venueMapUrl,
      moduleToggles: events.moduleToggles,
      fieldConfig: events.fieldConfig,
      branding: events.branding,
      registrationSettings: events.registrationSettings,
      communicationSettings: events.communicationSettings,
      publicPageSettings: events.publicPageSettings,
      createdBy: events.createdBy,
      updatedBy: events.updatedBy,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
    .from(events)
    .innerJoin(
      eventUserAssignments,
      and(
        eq(eventUserAssignments.eventId, events.id),
        eq(eventUserAssignments.authUserId, userId),
        eq(eventUserAssignments.isActive, true),
      ),
    )
    .orderBy(desc(events.startDate));

  return rows;
}

export async function getEvent(eventId: string) {
  // Validate eventId format (Bug fix #5)
  eventIdSchema.parse(eventId);

  // REQ 9: Per-event access control via assertEventAccess
  await assertEventAccess(eventId);

  // REQ 11: Query scoped by event_id
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');

  return event;
}

// ── Public: get event by slug (no auth) ───────────────────────
export async function getEventBySlug(slug: string) {
  if (!slug || slug.length > 100) throw new Error('Invalid event slug');

  const [event] = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      description: events.description,
      startDate: events.startDate,
      endDate: events.endDate,
      timezone: events.timezone,
      status: events.status,
      venueName: events.venueName,
      venueAddress: events.venueAddress,
      venueCity: events.venueCity,
      venueMapUrl: events.venueMapUrl,
      branding: events.branding,
      registrationSettings: events.registrationSettings,
      publicPageSettings: events.publicPageSettings,
    })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  if (!event) throw new Error('Event not found');
  if (event.status === 'draft') throw new Error('Event not found'); // Don't expose draft events

  return event;
}

export async function updateEventStatus(eventId: string, newStatus: EventStatus) {
  // Validate eventId
  eventIdSchema.parse(eventId);

  // REQ 9: Per-event access control (write operation — blocks read-only)
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });

  // REQ 11: Query scoped by event_id
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

  // Post-update verification: re-read to detect concurrent modifications
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
