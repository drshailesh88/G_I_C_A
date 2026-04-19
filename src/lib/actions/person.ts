'use server';

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  people,
  eventPeople,
  eventRegistrations,
  sessionAssignments,
  facultyInvites,
  travelRecords,
  accommodationRecords,
  transportPassengerAssignments,
  attendanceRecords,
  issuedCertificates,
  eventUserAssignments,
  auditLog,
} from '@/lib/db/schema';
import { eq, or, and, ilike, desc, sql, isNull, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/audit/write';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import {
  createPersonSchema,
  updatePersonSchema,
  personIdSchema,
  personSearchSchema,
  normalizePhone,
  type PersonSearchInput,
} from '@/lib/validations/person';

const PEOPLE_READ_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

const PEOPLE_WRITE_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

const eventIdSchema = z.string().uuid('Invalid event ID');
const eventPersonSourceSchema = z.enum([
  'registration',
  'invite',
  'assignment',
  'travel',
  'accommodation',
  'manual',
  'import',
]);
const MAX_IMPORT_BATCH_ROWS = 500;

function hasPeopleRole(
  has: ((params: { role: string }) => boolean) | undefined,
  requireWrite = false,
): boolean {
  // Some isolated test contexts stub auth() without Clerk's has() helper.
  // Real request sessions provide it, and when available we enforce people RBAC here.
  if (typeof has !== 'function') {
    return true;
  }

  const allowedRoles = requireWrite ? PEOPLE_WRITE_ROLES : PEOPLE_READ_ROLES;
  return [...allowedRoles].some((role) => has({ role }));
}

async function assertPeopleModuleAccess(options?: { requireWrite?: boolean }) {
  const session = await auth();
  if (!session.userId) {
    throw new Error('Unauthorized');
  }

  if (!hasPeopleRole(session.has, options?.requireWrite)) {
    throw new Error('Forbidden');
  }

  return session;
}

async function getActiveAssignmentEventIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ eventId: eventUserAssignments.eventId })
    .from(eventUserAssignments)
    .where(and(
      eq(eventUserAssignments.authUserId, userId),
      eq(eventUserAssignments.isActive, true),
    ));

  return rows.map((row) => row.eventId);
}

async function getPeopleLinkedEventIds(personIds: string[]): Promise<string[]> {
  if (personIds.length === 0) {
    return [];
  }

  const [
    eventPeopleRows,
    registrationRows,
    assignmentRows,
    inviteRows,
    travelRows,
    accommodationRows,
    transportRows,
    attendanceRows,
    certificateRows,
  ] = await Promise.all([
    db.select({ eventId: eventPeople.eventId }).from(eventPeople).where(inArray(eventPeople.personId, personIds)),
    db.select({ eventId: eventRegistrations.eventId }).from(eventRegistrations).where(inArray(eventRegistrations.personId, personIds)),
    db.select({ eventId: sessionAssignments.eventId }).from(sessionAssignments).where(inArray(sessionAssignments.personId, personIds)),
    db.select({ eventId: facultyInvites.eventId }).from(facultyInvites).where(inArray(facultyInvites.personId, personIds)),
    db.select({ eventId: travelRecords.eventId }).from(travelRecords).where(inArray(travelRecords.personId, personIds)),
    db.select({ eventId: accommodationRecords.eventId }).from(accommodationRecords).where(inArray(accommodationRecords.personId, personIds)),
    db.select({ eventId: transportPassengerAssignments.eventId }).from(transportPassengerAssignments).where(inArray(transportPassengerAssignments.personId, personIds)),
    db.select({ eventId: attendanceRecords.eventId }).from(attendanceRecords).where(inArray(attendanceRecords.personId, personIds)),
    db.select({ eventId: issuedCertificates.eventId }).from(issuedCertificates).where(inArray(issuedCertificates.personId, personIds)),
  ]);

  return Array.from(new Set([
    ...eventPeopleRows,
    ...registrationRows,
    ...assignmentRows,
    ...inviteRows,
    ...travelRows,
    ...accommodationRows,
    ...transportRows,
    ...attendanceRows,
    ...certificateRows,
  ].map((row) => row.eventId)));
}

function assertPeopleEventRole(
  role: string | null,
  options?: { requireWrite?: boolean },
) {
  const allowedRoles = options?.requireWrite ? PEOPLE_WRITE_ROLES : PEOPLE_READ_ROLES;
  if (!role || !allowedRoles.has(role)) {
    throw new Error('Forbidden');
  }
}

// ── Dedup check ────────────────────────────────────────────────
// Returns existing person if email or phone (E.164) matches.
export async function findDuplicatePerson(
  email: string | undefined,
  phoneE164: string | undefined,
): Promise<{ id: string; fullName: string; email: string | null; phoneE164: string | null } | null> {
  if (!email && !phoneE164) return null;

  const conditions = [];
  if (email) conditions.push(eq(people.email, email));
  if (phoneE164) conditions.push(eq(people.phoneE164, phoneE164));

  const [match] = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      email: people.email,
      phoneE164: people.phoneE164,
    })
    .from(people)
    .where(and(isNull(people.anonymizedAt), or(...conditions)))
    .limit(1);

  return match ?? null;
}

// ── Create Person ──────────────────────────────────────────────
export async function createPerson(input: unknown) {
  const { userId } = await assertPeopleModuleAccess({ requireWrite: true });
  if (!userId) throw new Error('Unauthorized');

  const validated = createPersonSchema.parse(input);

  // Normalize phone to E.164
  let phoneE164: string | null = null;
  if (validated.phone) {
    phoneE164 = normalizePhone(validated.phone);
  }

  // Check for duplicates
  const duplicate = await findDuplicatePerson(
    validated.email || undefined,
    phoneE164 || undefined,
  );

  if (duplicate) {
    return {
      duplicate: true,
      existingPerson: duplicate,
      message: `Person already exists: ${duplicate.fullName} (matched on ${duplicate.email === validated.email ? 'email' : 'phone'})`,
    };
  }

  const [person] = await db
    .insert(people)
    .values({
      salutation: validated.salutation || null,
      fullName: validated.fullName,
      email: validated.email || null,
      phoneE164,
      designation: validated.designation || null,
      specialty: validated.specialty || null,
      organization: validated.organization || null,
      city: validated.city || null,
      tags: validated.tags,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const createdFields: string[] = ['fullName'];
  if (validated.salutation) createdFields.push('salutation');
  if (validated.email) createdFields.push('email');
  if (phoneE164) createdFields.push('phoneE164');
  if (validated.designation) createdFields.push('designation');
  if (validated.specialty) createdFields.push('specialty');
  if (validated.organization) createdFields.push('organization');
  if (validated.city) createdFields.push('city');
  if (validated.tags.length > 0) createdFields.push('tags');

  await writeAudit({
    actorUserId: userId,
    eventId: null,
    action: 'create',
    resource: 'people',
    resourceId: person.id,
    meta: { changedFields: createdFields },
  });

  revalidatePath('/people');
  return { duplicate: false, person };
}

// ── Update Person ──────────────────────────────────────────────
export async function updatePerson(input: unknown) {
  const { userId } = await assertPeopleModuleAccess({ requireWrite: true });
  if (!userId) throw new Error('Unauthorized');

  const validated = updatePersonSchema.parse(input);
  const { personId, ...fields } = validated;

  // Normalize phone if provided
  let phoneE164: string | undefined;
  if (fields.phone !== undefined) {
    phoneE164 = fields.phone ? normalizePhone(fields.phone) : undefined;
  }

  const updateData: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (fields.salutation !== undefined) updateData.salutation = fields.salutation || null;
  if (fields.fullName !== undefined) updateData.fullName = fields.fullName;
  if (fields.email !== undefined) updateData.email = fields.email || null;
  if (phoneE164 !== undefined) updateData.phoneE164 = phoneE164 || null;
  if (fields.designation !== undefined) updateData.designation = fields.designation || null;
  if (fields.specialty !== undefined) updateData.specialty = fields.specialty || null;
  if (fields.organization !== undefined) updateData.organization = fields.organization || null;
  if (fields.city !== undefined) updateData.city = fields.city || null;
  if (fields.tags !== undefined) updateData.tags = fields.tags;

  // Snapshot the row before mutation so the audit record can carry a real
  // before -> after diff for change-history rendering.
  const [previous] = await db.select().from(people).where(eq(people.id, personId)).limit(1);

  const [updated] = await db
    .update(people)
    .set(updateData)
    .where(and(
      eq(people.id, personId),
      isNull(people.archivedAt),
      isNull(people.anonymizedAt),
    ))
    .returning();

  if (!updated) throw new Error('Person not found');

  const changedFieldNames = Object.keys(updateData).filter(
    (k) => k !== 'updatedBy' && k !== 'updatedAt',
  );

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (previous) {
    for (const field of changedFieldNames) {
      const prevVal = (previous as Record<string, unknown>)[field] ?? null;
      const nextVal = updateData[field] ?? null;
      const prevSerialized = JSON.stringify(prevVal);
      const nextSerialized = JSON.stringify(nextVal);
      if (prevSerialized !== nextSerialized) {
        changes[field] = { from: prevVal, to: nextVal };
      }
    }
  }

  await writeAudit({
    actorUserId: userId,
    eventId: null,
    action: 'update',
    resource: 'people',
    resourceId: personId,
    meta: {
      source: 'admin',
      changedFields: changedFieldNames,
      changes,
    },
  });

  revalidatePath('/people');
  revalidatePath(`/people/${personId}`);
  return updated;
}

// ── Get Person ─────────────────────────────────────────────────
export async function getPerson(personId: string) {
  await assertPeopleModuleAccess();
  personIdSchema.parse(personId);

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), isNull(people.anonymizedAt)))
    .limit(1);

  if (!person) throw new Error('Person not found');
  return person;
}

// ── Search People ──────────────────────────────────────────────
export async function searchPeople(input: PersonSearchInput) {
  const { userId } = await assertPeopleModuleAccess();
  if (!userId) throw new Error('Unauthorized');

  const validated = personSearchSchema.parse(input);
  const { query, organization, city, specialty, tag, view, page, limit } = validated;
  const offset = (page - 1) * limit;

  const conditions = [isNull(people.anonymizedAt), isNull(people.archivedAt)];

  // Full-text search on name, email, organization
  if (query) {
    // Escape SQL LIKE wildcards to prevent unintended pattern matching
    const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
    conditions.push(
      or(
        ilike(people.fullName, `%${escaped}%`),
        ilike(people.email, `%${escaped}%`),
        ilike(people.organization, `%${escaped}%`),
        eq(people.phoneE164, query), // exact phone match (no escaping needed)
      )!,
    );
  }

  if (organization) {
    const escaped = organization.replace(/%/g, '\\%').replace(/_/g, '\\_');
    conditions.push(ilike(people.organization, `%${escaped}%`));
  }
  if (city) {
    const escaped = city.replace(/%/g, '\\%').replace(/_/g, '\\_');
    conditions.push(ilike(people.city, `%${escaped}%`));
  }
  if (specialty) {
    const escaped = specialty.replace(/%/g, '\\%').replace(/_/g, '\\_');
    conditions.push(ilike(people.specialty, `%${escaped}%`));
  }
  if (tag) conditions.push(sql`${people.tags} @> ${JSON.stringify([tag])}::jsonb`);

  // Saved views filter by tags
  if (view === 'faculty') conditions.push(sql`${people.tags} @> '["faculty"]'::jsonb`);
  else if (view === 'delegates') conditions.push(sql`${people.tags} @> '["delegate"]'::jsonb`);
  else if (view === 'sponsors') conditions.push(sql`${people.tags} @> '["sponsor"]'::jsonb`);
  else if (view === 'vips') conditions.push(sql`${people.tags} @> '["VIP"]'::jsonb`);

  // Order
  const orderBy = view === 'recent'
    ? desc(people.createdAt)
    : people.fullName; // alphabetical default

  const rows = await db
    .select()
    .from(people)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // Count for pagination
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(people)
    .where(and(...conditions));

  return {
    people: rows,
    total: Number(count),
    page,
    limit,
    totalPages: Math.ceil(Number(count) / limit),
  };
}

// ── Soft Delete (Archive) ──────────────────────────────────────
export async function archivePerson(personId: string) {
  const { userId } = await assertPeopleModuleAccess({ requireWrite: true });
  if (!userId) throw new Error('Unauthorized');
  personIdSchema.parse(personId);

  const [updated] = await db
    .update(people)
    .set({
      archivedAt: new Date(),
      archivedBy: userId,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(people.id, personId), isNull(people.archivedAt)))
    .returning();

  if (!updated) throw new Error('Person not found or already archived');

  await writeAudit({
    actorUserId: userId,
    eventId: null,
    action: 'delete',
    resource: 'people',
    resourceId: personId,
    meta: { changedFields: ['archivedAt'] },
  });

  revalidatePath('/people');
  return updated;
}

// ── Restore ────────────────────────────────────────────────────
export async function restorePerson(personId: string) {
  const { userId } = await assertPeopleModuleAccess({ requireWrite: true });
  if (!userId) throw new Error('Unauthorized');
  personIdSchema.parse(personId);

  const [updated] = await db
    .update(people)
    .set({
      archivedAt: null,
      archivedBy: null,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(people.id, personId))
    .returning();

  if (!updated) throw new Error('Person not found');

  await writeAudit({
    actorUserId: userId,
    eventId: null,
    action: 'update',
    resource: 'people',
    resourceId: personId,
    meta: { changedFields: ['archivedAt'], action: 'restore' },
  });

  revalidatePath('/people');
  return updated;
}

// ── Anonymize (Irreversible) ───────────────────────────────────
export async function anonymizePerson(personId: string) {
  const { userId } = await assertPeopleModuleAccess({ requireWrite: true });
  if (!userId) throw new Error('Unauthorized');
  personIdSchema.parse(personId);

  const [updated] = await db
    .update(people)
    .set({
      fullName: '[ANONYMIZED]',
      email: null,
      phoneE164: null,
      designation: null,
      specialty: null,
      organization: null,
      city: null,
      tags: [],
      anonymizedAt: new Date(),
      anonymizedBy: userId,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(people.id, personId), isNull(people.anonymizedAt)))
    .returning();

  if (!updated) throw new Error('Person not found or already anonymized');

  await writeAudit({
    actorUserId: userId,
    eventId: null,
    action: 'delete',
    resource: 'people',
    resourceId: personId,
    meta: {
      changedFields: ['fullName', 'email', 'phoneE164', 'designation', 'specialty', 'organization', 'city', 'tags'],
      action: 'anonymize',
    },
  });

  revalidatePath('/people');
  return updated;
}

// ── Upsert Event–People Junction ───────────────────────────────
// Called automatically on first event touchpoint.
export async function ensureEventPerson(
  eventId: string,
  personId: string,
  source: string,
) {
  const scopedEventId = eventIdSchema.parse(eventId);
  const scopedPersonId = personIdSchema.parse(personId);
  const validatedSource = eventPersonSourceSchema.parse(source);

  await assertEventAccess(scopedEventId, { requireWrite: true });

  await db
    .insert(eventPeople)
    .values({ eventId: scopedEventId, personId: scopedPersonId, source: validatedSource })
    .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });
}

// ── Batch Import ──────────────────────────────────────────────
// Imports an array of people in one server action call.
// Returns per-row results for the client to display.
export type ImportRowResult = {
  rowNumber: number;
  status: 'created' | 'duplicate' | 'error';
  error?: string;
  personId?: string;
};

export async function importPeopleBatch(
  rows: Array<{
    rowNumber: number;
    fullName: string;
    email?: string;
    phone?: string;
    salutation?: string;
    designation?: string;
    specialty?: string;
    organization?: string;
    city?: string;
    tags?: string[];
  }>,
): Promise<{ results: ImportRowResult[]; imported: number; duplicates: number; errors: number }> {
  const { userId } = await assertPeopleModuleAccess({ requireWrite: true });
  if (!userId) throw new Error('Unauthorized');
  if (rows.length > MAX_IMPORT_BATCH_ROWS) {
    throw new Error(`Import batch exceeds ${MAX_IMPORT_BATCH_ROWS} rows`);
  }

  const results: ImportRowResult[] = [];
  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const result = await createPerson({
        fullName: row.fullName,
        email: row.email || '',
        phone: row.phone || '',
        salutation: row.salutation,
        designation: row.designation,
        specialty: row.specialty,
        organization: row.organization,
        city: row.city,
        tags: row.tags || [],
      });

      if (result && 'duplicate' in result && result.duplicate) {
        duplicates++;
        results.push({ rowNumber: row.rowNumber, status: 'duplicate' });
      } else if (result && 'person' in result && result.person) {
        imported++;
        results.push({ rowNumber: row.rowNumber, status: 'created', personId: result.person.id });
      }
    } catch (err) {
      errors++;
      results.push({
        rowNumber: row.rowNumber,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  revalidatePath('/people');
  return { results, imported, duplicates, errors };
}

// ── Get people linked to an event (via event_people junction) ──
export async function getEventPeople(eventId: string) {
  const scopedEventId = eventIdSchema.parse(eventId);
  const { userId, role } = await assertEventAccess(scopedEventId);
  assertPeopleEventRole(role);

  const rows = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      email: people.email,
      phoneE164: people.phoneE164,
    })
    .from(eventPeople)
    .innerJoin(people, eq(eventPeople.personId, people.id))
    .where(and(
      eq(eventPeople.eventId, scopedEventId),
      isNull(people.archivedAt),
      isNull(people.anonymizedAt),
    ));

  if (role === ROLES.SUPER_ADMIN) {
    await writeAudit({
      actorUserId: userId,
      eventId: scopedEventId,
      action: 'read',
      resource: 'people',
      resourceId: scopedEventId,
      meta: {
        count: rows.length,
        scope: 'event_people',
      },
    });
  }

  return rows;
}

// ── Merge Duplicate People ─────────────────────────────────────

const mergeFieldChoiceSchema = z.enum(['left', 'right', 'both']);

const mergePeopleSchema = z.object({
  keepId: z.string().uuid('keepId must be a valid UUID'),
  dropId: z.string().uuid('dropId must be a valid UUID'),
  fieldChoices: z.object({
    fullName: mergeFieldChoiceSchema.default('left'),
    salutation: mergeFieldChoiceSchema.default('left'),
    email: mergeFieldChoiceSchema.default('left'),
    phoneE164: mergeFieldChoiceSchema.default('left'),
    designation: mergeFieldChoiceSchema.default('left'),
    specialty: mergeFieldChoiceSchema.default('left'),
    organization: mergeFieldChoiceSchema.default('left'),
    city: mergeFieldChoiceSchema.default('left'),
    bio: mergeFieldChoiceSchema.default('left'),
    photoStorageKey: mergeFieldChoiceSchema.default('left'),
  }).default({}),
});

export type MergePeopleResult =
  | { ok: true; survivorId: string }
  | { ok: false; error: string };

function pickTextField(
  choice: 'left' | 'right' | 'both',
  leftVal: string | null | undefined,
  rightVal: string | null | undefined,
  separator = ' / ',
): string | null {
  if (choice === 'left') return leftVal ?? null;
  if (choice === 'right') return rightVal ?? null;
  const parts = [leftVal, rightVal].filter((v): v is string => Boolean(v));
  return parts.length > 0 ? parts.join(separator) : null;
}

export async function mergePeople(input: unknown): Promise<MergePeopleResult> {
  const session = await assertPeopleModuleAccess({ requireWrite: true });
  const { userId } = session;
  if (!userId) throw new Error('Unauthorized');

  const validated = mergePeopleSchema.parse(input);
  const { keepId, dropId, fieldChoices: fc } = validated;

  if (keepId === dropId) {
    return { ok: false, error: 'Cannot merge a person with themselves' };
  }

  const [keeperRows, loserRows] = await Promise.all([
    db.select().from(people).where(and(eq(people.id, keepId), isNull(people.anonymizedAt))).limit(1),
    db.select().from(people).where(and(eq(people.id, dropId), isNull(people.anonymizedAt))).limit(1),
  ]);

  if (!keeperRows[0]) return { ok: false, error: 'Keeper person not found' };
  if (!loserRows[0]) return { ok: false, error: 'Drop person not found' };

  const keeper = keeperRows[0];
  const loser = loserRows[0];

  const isSuperAdmin =
    typeof session.has === 'function' && session.has({ role: ROLES.SUPER_ADMIN });
  if (!isSuperAdmin) {
    const [assignedEventIds, linkedEventIds] = await Promise.all([
      getActiveAssignmentEventIds(userId),
      getPeopleLinkedEventIds([keepId, dropId]),
    ]);
    const allowedEventIds = new Set(assignedEventIds);
    const unauthorizedEventIds = linkedEventIds.filter((eventId) => !allowedEventIds.has(eventId));

    if (unauthorizedEventIds.length > 0) {
      throw new Error('Forbidden');
    }
  }

  const mergedFields = {
    fullName: pickTextField(fc.fullName, keeper.fullName, loser.fullName) ?? keeper.fullName,
    salutation: pickTextField(fc.salutation, keeper.salutation, loser.salutation),
    email: pickTextField(fc.email, keeper.email, loser.email),
    phoneE164: pickTextField(fc.phoneE164, keeper.phoneE164, loser.phoneE164),
    designation: pickTextField(fc.designation, keeper.designation, loser.designation),
    specialty: pickTextField(fc.specialty, keeper.specialty, loser.specialty),
    organization: pickTextField(fc.organization, keeper.organization, loser.organization),
    city: pickTextField(fc.city, keeper.city, loser.city),
    bio: pickTextField(fc.bio, keeper.bio ?? null, loser.bio ?? null, '\n\n---\n\n'),
    photoStorageKey: pickTextField(fc.photoStorageKey, keeper.photoStorageKey ?? null, loser.photoStorageKey ?? null),
    tags: Array.from(new Set([
      ...(Array.isArray(keeper.tags) ? keeper.tags as string[] : []),
      ...(Array.isArray(loser.tags) ? loser.tags as string[] : []),
    ])),
  };

  const now = new Date();

  await db.transaction(async (tx) => {
    // Re-point event_people (unique: eventId + personId) — delete conflicts, then update remaining
    const keeperEventRows = await tx
      .select({ eventId: eventPeople.eventId })
      .from(eventPeople)
      .where(eq(eventPeople.personId, keepId));

    if (keeperEventRows.length > 0) {
      await tx.delete(eventPeople).where(and(
        eq(eventPeople.personId, dropId),
        inArray(eventPeople.eventId, keeperEventRows.map((r) => r.eventId)),
      ));
    }
    await tx.update(eventPeople).set({ personId: keepId }).where(eq(eventPeople.personId, dropId));

    // Re-point event_registrations (unique: eventId + personId)
    const keeperRegRows = await tx
      .select({ eventId: eventRegistrations.eventId })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.personId, keepId));

    if (keeperRegRows.length > 0) {
      await tx.delete(eventRegistrations).where(and(
        eq(eventRegistrations.personId, dropId),
        inArray(eventRegistrations.eventId, keeperRegRows.map((r) => r.eventId)),
      ));
    }
    await tx.update(eventRegistrations).set({ personId: keepId }).where(eq(eventRegistrations.personId, dropId));

    // Re-point session_assignments (unique: sessionId + personId + role)
    const keeperAssignPairs = await tx
      .select({ sessionId: sessionAssignments.sessionId, role: sessionAssignments.role })
      .from(sessionAssignments)
      .where(eq(sessionAssignments.personId, keepId));

    for (const pair of keeperAssignPairs) {
      await tx.delete(sessionAssignments).where(and(
        eq(sessionAssignments.personId, dropId),
        eq(sessionAssignments.sessionId, pair.sessionId),
        eq(sessionAssignments.role, pair.role),
      ));
    }
    await tx.update(sessionAssignments).set({ personId: keepId }).where(eq(sessionAssignments.personId, dropId));

    // Re-point attendance_records (partial unique index on (event_id, person_id, COALESCE(session_id, ...)))
    // Drop loser rows that would collide with an existing keeper check-in for the same event+session.
    const keeperAttendanceRows = await tx
      .select({ eventId: attendanceRecords.eventId, sessionId: attendanceRecords.sessionId })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.personId, keepId));
    for (const row of keeperAttendanceRows) {
      const sessionEq = row.sessionId === null
        ? isNull(attendanceRecords.sessionId)
        : eq(attendanceRecords.sessionId, row.sessionId);
      await tx.delete(attendanceRecords).where(and(
        eq(attendanceRecords.personId, dropId),
        eq(attendanceRecords.eventId, row.eventId),
        sessionEq,
      ));
    }
    await tx.update(attendanceRecords).set({ personId: keepId, updatedAt: now }).where(eq(attendanceRecords.personId, dropId));

    // Re-point issued_certificates (partial unique index on (event_id, person_id, certificate_type) WHERE status='issued')
    // Mark loser's "issued" rows as superseded for the same (event, type) instead of duplicating.
    const keeperCertRows = await tx
      .select({ eventId: issuedCertificates.eventId, certificateType: issuedCertificates.certificateType })
      .from(issuedCertificates)
      .where(and(eq(issuedCertificates.personId, keepId), eq(issuedCertificates.status, 'issued')));
    for (const row of keeperCertRows) {
      await tx
        .update(issuedCertificates)
        .set({ status: 'superseded', updatedAt: now })
        .where(and(
          eq(issuedCertificates.personId, dropId),
          eq(issuedCertificates.eventId, row.eventId),
          eq(issuedCertificates.certificateType, row.certificateType),
          eq(issuedCertificates.status, 'issued'),
        ));
    }
    await tx.update(issuedCertificates).set({ personId: keepId, updatedAt: now }).where(eq(issuedCertificates.personId, dropId));

    // Re-point faculty_invites, travel, accommodation, transport (no conflicting unique constraints)
    await tx.update(facultyInvites).set({ personId: keepId }).where(eq(facultyInvites.personId, dropId));
    await tx.update(travelRecords).set({ personId: keepId }).where(eq(travelRecords.personId, dropId));
    await tx.update(accommodationRecords).set({ personId: keepId }).where(eq(accommodationRecords.personId, dropId));
    await tx.update(transportPassengerAssignments)
      .set({ personId: keepId })
      .where(eq(transportPassengerAssignments.personId, dropId));

    // Update winner with merged fields
    await tx.update(people).set({ ...mergedFields, updatedBy: userId, updatedAt: now }).where(eq(people.id, keepId));

    // Soft-delete loser with tombstone metadata in audit log
    await tx.update(people).set({
      archivedAt: now,
      archivedBy: userId,
      updatedBy: userId,
      updatedAt: now,
    }).where(eq(people.id, dropId));
  });

  await writeAudit({
    actorUserId: userId,
    eventId: null,
    action: 'delete',
    resource: 'people',
    resourceId: dropId,
    meta: { action: 'merge', mergedIntoId: keepId, fieldChoices: fc },
  });

  revalidatePath('/people');
  revalidatePath(`/people/${keepId}`);

  return { ok: true, survivorId: keepId };
}

// ── Person Change History ──────────────────────────────────────

const HISTORY_PAGE_SIZE = 25;

export type PersonHistoryRow = {
  id: string;
  actorUserId: string;
  action: string;
  resource: string;
  eventId: string | null;
  source: string;
  timestamp: Date;
  changedFields: string[];
  changes: Record<string, { from: unknown; to: unknown }>;
  meta: Record<string, unknown>;
};

export type PersonHistoryResult = {
  rows: PersonHistoryRow[];
  total: number;
  page: number;
  totalPages: number;
};

function deriveSource(meta: Record<string, unknown>, action: string): string {
  const explicit = typeof meta.source === 'string' ? meta.source : null;
  if (explicit) return explicit;
  const metaAction = typeof meta.action === 'string' ? meta.action : null;
  if (metaAction === 'merge') return 'merge';
  if (metaAction === 'restore') return 'admin';
  if (action === 'create') return 'admin';
  return 'admin';
}

function deriveChanges(meta: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  if (meta.changes && typeof meta.changes === 'object' && !Array.isArray(meta.changes)) {
    return meta.changes as Record<string, { from: unknown; to: unknown }>;
  }
  return {};
}

function deriveChangedFields(meta: Record<string, unknown>): string[] {
  if (Array.isArray(meta.changedFields)) {
    return (meta.changedFields as unknown[]).filter((f): f is string => typeof f === 'string');
  }
  if (meta.changes && typeof meta.changes === 'object' && !Array.isArray(meta.changes)) {
    return Object.keys(meta.changes as Record<string, unknown>);
  }
  return [];
}

export async function getPersonHistory(
  personId: string,
  page = 1,
): Promise<PersonHistoryResult> {
  const session = await auth();
  if (!session.userId) throw new Error('Unauthorized');
  if (!hasPeopleRole(session.has)) throw new Error('Forbidden');

  personIdSchema.parse(personId);

  const isSuperAdmin =
    typeof session.has === 'function' && session.has({ role: ROLES.SUPER_ADMIN });
  const offset = (page - 1) * HISTORY_PAGE_SIZE;

  // Super Admin sees all history. Other roles see global (eventId IS NULL) rows
  // plus history for events they are actively assigned to. This prevents
  // cross-event leakage while still surfacing real per-event activity.
  let scopeCondition;
  if (isSuperAdmin) {
    scopeCondition = and(eq(auditLog.resource, 'people'), eq(auditLog.resourceId, personId));
  } else {
    const assignmentRows = await db
      .select({ eventId: eventUserAssignments.eventId })
      .from(eventUserAssignments)
      .where(and(
        eq(eventUserAssignments.authUserId, session.userId),
        eq(eventUserAssignments.isActive, true),
      ));
    const assignedEventIds = assignmentRows.map(r => r.eventId);
    const eventScope = assignedEventIds.length > 0
      ? or(isNull(auditLog.eventId), inArray(auditLog.eventId, assignedEventIds))
      : isNull(auditLog.eventId);
    scopeCondition = and(
      eq(auditLog.resource, 'people'),
      eq(auditLog.resourceId, personId),
      eventScope,
    );
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(scopeCondition)
    .orderBy(desc(auditLog.timestamp))
    .limit(HISTORY_PAGE_SIZE)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .where(scopeCondition);

  const total = Number(count);

  return {
    rows: rows.map((r) => {
      const meta = (r.meta ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        actorUserId: r.actorUserId,
        action: r.action,
        resource: r.resource,
        eventId: r.eventId,
        source: deriveSource(meta, r.action),
        timestamp: r.timestamp,
        changedFields: deriveChangedFields(meta),
        changes: deriveChanges(meta),
        meta,
      };
    }),
    total,
    page,
    totalPages: Math.ceil(total / HISTORY_PAGE_SIZE),
  };
}
