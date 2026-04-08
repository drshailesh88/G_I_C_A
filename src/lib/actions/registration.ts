'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { events, people, eventRegistrations, eventPeople } from '@/lib/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  publicRegistrationSchema,
  updateRegistrationStatusSchema,
  registrationIdSchema,
  REGISTRATION_TRANSITIONS,
  generateRegistrationNumber,
  generateQrToken,
  type RegistrationStatus,
} from '@/lib/validations/registration';
import { normalizePhone } from '@/lib/validations/person';
import { findDuplicatePerson } from './person';
import { withEventScope } from '@/lib/db/with-event-scope';

// ── Public registration (no auth required) ─────────────────────
export async function registerForEvent(eventId: string, input: unknown) {
  const validated = publicRegistrationSchema.parse(input);

  // Fetch event to check status and settings
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');
  if (event.status !== 'published') throw new Error('Event is not accepting registrations');

  const regSettings = event.registrationSettings as Record<string, unknown> ?? {};

  // Capacity enforcement
  if (regSettings.maxCapacity) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventRegistrations)
      .where(
        withEventScope(
          eventRegistrations.eventId,
          eventId,
          sql`${eventRegistrations.status} NOT IN ('cancelled', 'declined')`,
        ),
      );

    const currentCount = Number(count);
    const maxCapacity = Number(regSettings.maxCapacity);

    if (currentCount >= maxCapacity) {
      if (regSettings.enableWaitlist) {
        // Will be created as waitlisted below
      } else {
        throw new Error('Event has reached maximum capacity');
      }
    }
  }

  // Normalize phone
  const phoneE164 = normalizePhone(validated.phone);

  // Find or create person (dedup on email/phone)
  let personId: string;
  const existingPerson = await findDuplicatePerson(validated.email, phoneE164);

  if (existingPerson) {
    personId = existingPerson.id;
  } else {
    const [newPerson] = await db
      .insert(people)
      .values({
        fullName: validated.fullName,
        email: validated.email,
        phoneE164,
        designation: validated.designation || null,
        specialty: validated.specialty || null,
        organization: validated.organization || null,
        city: validated.city || null,
        tags: [],
        createdBy: 'system:registration',
        updatedBy: 'system:registration',
      })
      .returning();
    personId = newPerson.id;
  }

  // Check for existing registration for this event
  const [existingReg] = await db
    .select()
    .from(eventRegistrations)
    .where(withEventScope(eventRegistrations.eventId, eventId, eq(eventRegistrations.personId, personId)))
    .limit(1);

  if (existingReg) {
    throw new Error('You are already registered for this event');
  }

  // Determine initial status
  let initialStatus: RegistrationStatus = 'confirmed';

  if (regSettings.requiresApproval) {
    initialStatus = 'pending';
  }

  // Check if capacity exceeded — go to waitlist
  if (regSettings.maxCapacity) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventRegistrations)
      .where(
        withEventScope(
          eventRegistrations.eventId,
          eventId,
          sql`${eventRegistrations.status} IN ('confirmed', 'pending')`,
        ),
      );

    if (Number(count) >= Number(regSettings.maxCapacity) && regSettings.enableWaitlist) {
      initialStatus = 'waitlisted';
    }
  }

  // Get sequence number for registration number
  const [{ count: totalRegs }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventRegistrations)
    .where(eq(eventRegistrations.eventId, eventId));

  const registrationNumber = generateRegistrationNumber(
    event.slug,
    'delegate',
    Number(totalRegs) + 1,
  );
  const qrCodeToken = generateQrToken();

  // Create registration
  const [registration] = await db
    .insert(eventRegistrations)
    .values({
      eventId,
      personId,
      registrationNumber,
      category: 'delegate',
      age: validated.age ?? null,
      status: initialStatus,
      preferencesJson: validated.preferences,
      qrCodeToken,
      createdBy: 'system:registration',
      updatedBy: 'system:registration',
    })
    .returning();

  // Auto-upsert event_people junction
  await db
    .insert(eventPeople)
    .values({ eventId, personId, source: 'registration' })
    .onConflictDoNothing({ target: [eventPeople.eventId, eventPeople.personId] });

  return {
    registrationId: registration.id,
    registrationNumber: registration.registrationNumber,
    qrCodeToken: registration.qrCodeToken,
    status: registration.status,
  };
}

// ── Admin: update registration status ──────────────────────────
export async function updateRegistrationStatus(input: unknown) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const { registrationId, newStatus } = updateRegistrationStatusSchema.parse(input);

  const [registration] = await db
    .select()
    .from(eventRegistrations)
    .where(eq(eventRegistrations.id, registrationId))
    .limit(1);

  if (!registration) throw new Error('Registration not found');

  const currentStatus = registration.status as RegistrationStatus;
  const allowed = REGISTRATION_TRANSITIONS[currentStatus];

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

  if (newStatus === 'cancelled') {
    updateData.cancelledAt = new Date();
  }

  const [updated] = await db
    .update(eventRegistrations)
    .set(updateData)
    .where(eq(eventRegistrations.id, registrationId))
    .returning();

  revalidatePath(`/events/${registration.eventId}/registrations`);
  return updated;
}

// ── Admin: get registrations for an event ──────────────────────
export async function getEventRegistrations(eventId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: eventRegistrations.id,
      eventId: eventRegistrations.eventId,
      personId: eventRegistrations.personId,
      registrationNumber: eventRegistrations.registrationNumber,
      category: eventRegistrations.category,
      age: eventRegistrations.age,
      status: eventRegistrations.status,
      qrCodeToken: eventRegistrations.qrCodeToken,
      registeredAt: eventRegistrations.registeredAt,
      cancelledAt: eventRegistrations.cancelledAt,
      personName: people.fullName,
      personEmail: people.email,
      personPhone: people.phoneE164,
      personOrganization: people.organization,
    })
    .from(eventRegistrations)
    .innerJoin(people, eq(eventRegistrations.personId, people.id))
    .where(eq(eventRegistrations.eventId, eventId))
    .orderBy(desc(eventRegistrations.registeredAt));

  return rows;
}
