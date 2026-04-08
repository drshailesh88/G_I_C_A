'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { people, eventPeople } from '@/lib/db/schema';
import { eq, or, and, ilike, desc, sql, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  createPersonSchema,
  updatePersonSchema,
  personIdSchema,
  personSearchSchema,
  normalizePhone,
  type PersonSearchInput,
} from '@/lib/validations/person';

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
  const { userId } = await auth();
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

  revalidatePath('/people');
  return { duplicate: false, person };
}

// ── Update Person ──────────────────────────────────────────────
export async function updatePerson(input: unknown) {
  const { userId } = await auth();
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

  const [updated] = await db
    .update(people)
    .set(updateData)
    .where(eq(people.id, personId))
    .returning();

  if (!updated) throw new Error('Person not found');

  revalidatePath('/people');
  revalidatePath(`/people/${personId}`);
  return updated;
}

// ── Get Person ─────────────────────────────────────────────────
export async function getPerson(personId: string) {
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
  const { userId } = await auth();
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
  const { userId } = await auth();
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

  revalidatePath('/people');
  return updated;
}

// ── Restore ────────────────────────────────────────────────────
export async function restorePerson(personId: string) {
  const { userId } = await auth();
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

  revalidatePath('/people');
  return updated;
}

// ── Anonymize (Irreversible) ───────────────────────────────────
export async function anonymizePerson(personId: string) {
  const { userId } = await auth();
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
  await db
    .insert(eventPeople)
    .values({ eventId, personId, source })
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
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

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
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      email: people.email,
      phoneE164: people.phoneE164,
    })
    .from(eventPeople)
    .innerJoin(people, eq(eventPeople.personId, people.id))
    .where(and(eq(eventPeople.eventId, eventId), isNull(people.anonymizedAt)));

  return rows;
}
