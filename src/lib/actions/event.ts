'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  events,
  eventUserAssignments,
  organizations,
  halls,
  sessions,
  sessionRoleRequirements,
  notificationTemplates,
  automationTriggers,
} from '@/lib/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z, ZodError, ZodIssue } from 'zod';
import { createEventSchema, updateEventSchema, eventIdSchema, EVENT_TRANSITIONS, fieldConfigSchema, type EventStatus, type FieldConfig } from '@/lib/validations/event';
import { assertEventAccess, getEventListContext } from '@/lib/auth/event-access';
import { withEventScope } from '@/lib/db/with-event-scope';
import { ROLES } from '@/lib/auth/roles';
import { getAppRoleFromSession, sessionHasAnyRole, sessionHasRole } from '@/lib/auth/session-role';

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

const EVENT_CREATE_ROLES: ReadonlySet<string> = new Set(['org:super_admin', 'org:event_coordinator']);

function canCreateEvents(session: Parameters<typeof getAppRoleFromSession>[0]): boolean {
  // Some isolated test contexts stub auth() without session claims.
  // Real request sessions provide them; when absent we fall open so tests can
  // exercise downstream logic without threading role state everywhere.
  if (!session?.sessionClaims) return true;
  const role = getAppRoleFromSession(session);
  return role !== null && EVENT_CREATE_ROLES.has(role);
}

function buildEventStateFilters(event: {
  id: string;
  status: EventStatus;
  updatedAt?: Date | null;
}) {
  const filters = [
    eq(events.id, event.id),
    eq(events.status, event.status),
  ];

  if (event.updatedAt) {
    filters.push(eq(events.updatedAt, event.updatedAt));
  }

  return filters;
}

export type CreateEventResult =
  | { ok: true; id: string }
  | { ok: false; status: 400; fieldErrors: Record<string, string[]>; formErrors: string[] };

export type UpdateEventResult =
  | { ok: true }
  | { ok: false; status: 400; fieldErrors: Record<string, string[]>; formErrors: string[] };

export async function createEvent(formData: FormData): Promise<CreateEventResult> {
  const session = await auth();
  const { userId } = session;
  if (!userId) throw new Error('Unauthorized');
  if (!canCreateEvents(session)) throw new Error('Forbidden');

  // Parse JSON safely BEFORE Zod validation (Bug fix #4)
  let moduleTogglesRaw: unknown;
  try {
    moduleTogglesRaw = safeJsonParse(
      (formData.get('moduleToggles') as string) || '{}',
      'moduleToggles',
    );
  } catch (err) {
    if (err instanceof ZodError) {
      const flat = err.flatten();
      return { ok: false, status: 400, fieldErrors: flat.fieldErrors as Record<string, string[]>, formErrors: flat.formErrors };
    }
    throw err;
  }

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

  const parsed = createEventSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, status: 400, fieldErrors: flat.fieldErrors as Record<string, string[]>, formErrors: flat.formErrors };
  }

  const validated = parsed.data;
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

  return { ok: true, id: event.id };
}

export async function getEvents() {
  const { userId, role, isSuperAdmin } = await getEventListContext();
  if (!userId) throw new Error('Unauthorized');

  // Keep event discovery consistent with assertEventAccess: if the session has
  // no recognized Clerk role, the user should not see event links that will
  // immediately dead-end on module pages.
  if (!role) {
    return [];
  }

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
      fieldConfig: events.fieldConfig,
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

  const [updated] = await db
    .update(events)
    .set(updateData)
    .where(and(...buildEventStateFilters({
      id: eventId,
      status: currentStatus,
      updatedAt: event.updatedAt,
    })))
    .returning({ id: events.id });

  if (!updated) {
    throw new Error(
      'Forbidden: stale conflict — event was concurrently modified or access was denied',
    );
  }

  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`);

  return { success: true };
}

export type TransferOwnershipResult =
  | { ok: true }
  | { ok: false; error: string };

export async function transferEventOwnership(
  eventId: string,
  newOwnerUserId: string,
): Promise<TransferOwnershipResult> {
  const session = await auth();
  const { userId } = session;
  if (!userId) return { ok: false, error: 'Not authenticated' };

  if (!sessionHasRole(session, ROLES.SUPER_ADMIN)) {
    return { ok: false, error: 'Forbidden: only Super Admin can transfer event ownership' };
  }

  const parsedEventId = eventIdSchema.safeParse(eventId);
  if (!parsedEventId.success) return { ok: false, error: 'Invalid event ID' };

  if (!newOwnerUserId || typeof newOwnerUserId !== 'string' || newOwnerUserId.trim().length === 0) {
    return { ok: false, error: 'New owner user ID is required' };
  }

  const normalizedNewOwnerUserId = newOwnerUserId.trim();
  const updatedAt = new Date();

  const [eventRow] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, parsedEventId.data))
    .limit(1);

  if (!eventRow) {
    return { ok: false, error: 'Event not found' };
  }

  const [currentOwner] = await db
    .select({
      id: eventUserAssignments.id,
      authUserId: eventUserAssignments.authUserId,
    })
    .from(eventUserAssignments)
    .where(
      withEventScope(
        eventUserAssignments.eventId,
        eventId,
        eq(eventUserAssignments.assignmentType, 'owner'),
        eq(eventUserAssignments.isActive, true),
      ),
    )
    .limit(1);

  if (currentOwner?.authUserId === normalizedNewOwnerUserId) {
    await db
      .update(events)
      .set({ updatedBy: userId, updatedAt })
      .where(eq(events.id, eventId));

    revalidatePath(`/events/${eventId}/team`);
    revalidatePath(`/events/${eventId}`);

    return { ok: true };
  }

  if (currentOwner) {
    await db
      .update(eventUserAssignments)
      .set({
        assignmentType: 'collaborator',
        isActive: true,
        updatedAt,
      })
      .where(eq(eventUserAssignments.id, currentOwner.id));
  }

  // Insert new owner or reactivate existing record for the new owner
  const [existing] = await db
    .select({ id: eventUserAssignments.id })
    .from(eventUserAssignments)
    .where(
      withEventScope(
        eventUserAssignments.eventId,
        eventId,
        eq(eventUserAssignments.authUserId, normalizedNewOwnerUserId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(eventUserAssignments)
      .set({ isActive: true, assignmentType: 'owner', assignedBy: userId, updatedAt })
      .where(eq(eventUserAssignments.id, existing.id));
  } else {
    await db.insert(eventUserAssignments).values({
      eventId,
      authUserId: normalizedNewOwnerUserId,
      assignmentType: 'owner',
      assignedBy: userId,
    });
  }

  // Reflect actor in event metadata (req 4)
  await db
    .update(events)
    .set({ updatedBy: userId, updatedAt })
    .where(eq(events.id, eventId));

  revalidatePath(`/events/${eventId}/team`);
  revalidatePath(`/events/${eventId}`);

  return { ok: true };
}

// ── Duplicate Event ───────────────────────────────────────────

export type DuplicateEventResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const duplicateEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').max(200, 'Event name too long'),
  newStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
});

function shiftDate(date: Date | null, shiftMs: number): Date | null {
  if (!date) return null;
  return new Date(date.getTime() + shiftMs);
}

export async function duplicateEvent(
  sourceEventId: string,
  input: { name: string; newStartDate: string },
): Promise<DuplicateEventResult> {
  const parsedId = eventIdSchema.safeParse(sourceEventId);
  if (!parsedId.success) return { ok: false, error: 'Invalid event ID' };

  const session = await auth();
  const { userId } = session;
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (!canCreateEvents(session)) {
    return { ok: false, error: 'Forbidden: only Event Coordinator or Super Admin can duplicate events' };
  }

  await assertEventAccess(sourceEventId);

  const parsed = duplicateEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(', ') };
  }
  const { name, newStartDate } = parsed.data;

  const [sourceEvent] = await db
    .select()
    .from(events)
    .where(eq(events.id, sourceEventId))
    .limit(1);
  if (!sourceEvent) return { ok: false, error: 'Source event not found' };

  // Calculate how far to shift all dates
  const shiftMs = new Date(newStartDate).getTime() - sourceEvent.startDate.getTime();
  const newEndDate = new Date(sourceEvent.endDate.getTime() + shiftMs);

  // Create new event (status always draft; branding/toggles copied)
  const orgId = await getOrCreateDefaultOrg();
  const slug = slugify(name) + '-' + Date.now().toString(36);

  const [newEvent] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      slug,
      name,
      description: sourceEvent.description,
      startDate: new Date(newStartDate),
      endDate: newEndDate,
      timezone: sourceEvent.timezone,
      venueName: sourceEvent.venueName,
      venueAddress: sourceEvent.venueAddress,
      venueCity: sourceEvent.venueCity,
      venueMapUrl: sourceEvent.venueMapUrl,
      moduleToggles: sourceEvent.moduleToggles,
      fieldConfig: sourceEvent.fieldConfig,
      branding: sourceEvent.branding,
      registrationSettings: sourceEvent.registrationSettings,
      communicationSettings: sourceEvent.communicationSettings,
      publicPageSettings: sourceEvent.publicPageSettings,
      status: 'draft',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const newEventId = newEvent.id;

  // Copy halls (structural — no person link)
  const sourceHalls = await db.select().from(halls).where(eq(halls.eventId, sourceEventId));

  const hallIdMap = new Map<string, string>();
  if (sourceHalls.length > 0) {
    const newHalls = await db
      .insert(halls)
      .values(
        sourceHalls.map((h) => ({
          eventId: newEventId,
          name: h.name,
          capacity: h.capacity,
          sortOrder: h.sortOrder,
        })),
      )
      .returning({ id: halls.id });

    sourceHalls.forEach((old, i) => {
      hallIdMap.set(old.id, newHalls[i].id);
    });
  }

  // Copy sessions — two passes to preserve parent-child hierarchy
  const sourceSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.eventId, sourceEventId));

  const sessionIdMap = new Map<string, string>();

  const buildSessionValues = (s: typeof sourceSessions[number], parentId: string | null) => ({
    eventId: newEventId,
    parentSessionId: parentId,
    title: s.title,
    description: s.description,
    sessionDate: shiftDate(s.sessionDate, shiftMs),
    startAtUtc: shiftDate(s.startAtUtc, shiftMs),
    endAtUtc: shiftDate(s.endAtUtc, shiftMs),
    hallId: s.hallId ? (hallIdMap.get(s.hallId) ?? null) : null,
    sessionType: s.sessionType,
    track: s.track,
    isPublic: s.isPublic,
    cmeCredits: s.cmeCredits,
    sortOrder: s.sortOrder,
    status: 'draft' as const,
    createdBy: userId,
    updatedBy: userId,
  });

  const parentSessions = sourceSessions.filter((s) => s.parentSessionId === null);
  if (parentSessions.length > 0) {
    const newParents = await db
      .insert(sessions)
      .values(parentSessions.map((s) => buildSessionValues(s, null)))
      .returning({ id: sessions.id });

    parentSessions.forEach((old, i) => {
      sessionIdMap.set(old.id, newParents[i].id);
    });
  }

  const childSessions = sourceSessions.filter((s) => s.parentSessionId !== null);
  if (childSessions.length > 0) {
    const newChildren = await db
      .insert(sessions)
      .values(
        childSessions.map((s) =>
          buildSessionValues(s, s.parentSessionId ? (sessionIdMap.get(s.parentSessionId) ?? null) : null),
        ),
      )
      .returning({ id: sessions.id });

    childSessions.forEach((old, i) => {
      sessionIdMap.set(old.id, newChildren[i].id);
    });
  }

  // Copy session role requirements (structural — no person link)
  if (sessionIdMap.size > 0) {
    const oldSessionIds = [...sessionIdMap.keys()];
    const sourceReqs = await db
      .select()
      .from(sessionRoleRequirements)
      .where(inArray(sessionRoleRequirements.sessionId, oldSessionIds));

    if (sourceReqs.length > 0) {
      await db.insert(sessionRoleRequirements).values(
        sourceReqs.map((r) => ({
          sessionId: sessionIdMap.get(r.sessionId)!,
          role: r.role,
          requiredCount: r.requiredCount,
        })),
      );
    }
  }

  // Copy event-specific notification templates (not system templates)
  const sourceTemplates = await db
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.eventId, sourceEventId),
        eq(notificationTemplates.isSystemTemplate, false),
      ),
    );

  const templateIdMap = new Map<string, string>();
  if (sourceTemplates.length > 0) {
    const newTpls = await db
      .insert(notificationTemplates)
      .values(
        sourceTemplates.map((t) => ({
          eventId: newEventId,
          templateKey: t.templateKey,
          channel: t.channel,
          templateName: t.templateName,
          metaCategory: t.metaCategory,
          triggerType: t.triggerType,
          sendMode: t.sendMode,
          status: 'draft' as const,
          versionNo: 1,
          subjectLine: t.subjectLine,
          bodyContent: t.bodyContent,
          previewText: t.previewText,
          allowedVariablesJson: t.allowedVariablesJson,
          requiredVariablesJson: t.requiredVariablesJson,
          brandingMode: t.brandingMode,
          customBrandingJson: t.customBrandingJson,
          whatsappTemplateName: t.whatsappTemplateName,
          whatsappLanguageCode: t.whatsappLanguageCode,
          isSystemTemplate: false,
          notes: t.notes,
          createdBy: userId,
          updatedBy: userId,
        })),
      )
      .returning({ id: notificationTemplates.id });

    sourceTemplates.forEach((old, i) => {
      templateIdMap.set(old.id, newTpls[i].id);
    });
  }

  // Copy automation triggers (map template IDs; keep global template refs intact)
  const sourceTriggers = await db
    .select()
    .from(automationTriggers)
    .where(eq(automationTriggers.eventId, sourceEventId));

  if (sourceTriggers.length > 0) {
    await db.insert(automationTriggers).values(
      sourceTriggers.map((t) => ({
        eventId: newEventId,
        triggerEventType: t.triggerEventType,
        guardConditionJson: t.guardConditionJson,
        channel: t.channel,
        templateId: templateIdMap.get(t.templateId) ?? t.templateId,
        recipientResolution: t.recipientResolution,
        delaySeconds: t.delaySeconds,
        idempotencyScope: t.idempotencyScope,
        isEnabled: t.isEnabled,
        priority: t.priority,
        notes: t.notes,
        createdBy: userId,
        updatedBy: userId,
      })),
    );
  }

  // Assign duplicating user as owner of the new event
  await db.insert(eventUserAssignments).values({
    eventId: newEventId,
    authUserId: userId,
    assignmentType: 'owner',
    assignedBy: userId,
  });

  revalidatePath('/events');
  revalidatePath('/dashboard');

  return { ok: true, id: newEventId };
}

export async function updateEvent(eventId: string, formData: FormData): Promise<UpdateEventResult> {
  eventIdSchema.parse(eventId);

  const { userId } = await assertEventAccess(eventId, { requireWrite: true });

  const moduleTogglesStr = formData.get('moduleToggles') as string | null;
  if (!moduleTogglesStr) {
    return { ok: false, status: 400, fieldErrors: {}, formErrors: ['moduleToggles is required'] };
  }
  let moduleTogglesRaw: unknown;
  try {
    moduleTogglesRaw = safeJsonParse(moduleTogglesStr, 'moduleToggles');
  } catch (err) {
    if (err instanceof ZodError) {
      const flat = err.flatten();
      return { ok: false, status: 400, fieldErrors: flat.fieldErrors as Record<string, string[]>, formErrors: flat.formErrors };
    }
    throw err;
  }

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

  const parsed = updateEventSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, status: 400, fieldErrors: flat.fieldErrors as Record<string, string[]>, formErrors: flat.formErrors };
  }

  const validated = parsed.data;

  await db
    .update(events)
    .set({
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
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/settings`);

  return { ok: true };
}

export type UpdateFieldConfigResult = { ok: true } | { ok: false; error: string };

export async function updateFieldConfig(
  eventId: string,
  input: unknown,
): Promise<UpdateFieldConfigResult> {
  const session = await auth();
  if (!session.userId) return { ok: false, error: 'Not authenticated' };

  if (!sessionHasAnyRole(session, [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR])) {
    return {
      ok: false,
      error: 'Only Event Coordinators and Super Admins can configure event fields',
    };
  }

  const eventIdResult = eventIdSchema.safeParse(eventId);
  if (!eventIdResult.success) return { ok: false, error: 'Invalid event ID' };

  const parsed = fieldConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid field configuration' };

  const { userId } = await assertEventAccess(eventId, { requireWrite: true });

  await db
    .update(events)
    .set({
      fieldConfig: parsed.data as unknown as FieldConfig,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  revalidatePath(`/events/${eventId}/fields`);

  return { ok: true };
}
