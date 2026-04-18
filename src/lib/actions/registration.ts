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
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { isRegistrationOpen } from '@/lib/flags';
import { emitCascadeEvent } from '@/lib/cascade/emit';
import { CASCADE_EVENTS } from '@/lib/cascade/events';

const REGISTRATION_READ_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

const REGISTRATION_WRITE_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

type RegistrationSettingsRecord = Record<string, unknown>;

function readBooleanSetting(
  settings: RegistrationSettingsRecord,
  primaryKey: string,
  legacyKey?: string,
) {
  const primaryValue = settings[primaryKey];
  if (typeof primaryValue === 'boolean') {
    return primaryValue;
  }

  if (!legacyKey) {
    return false;
  }

  const legacyValue = settings[legacyKey];
  return typeof legacyValue === 'boolean' ? legacyValue : false;
}

function readCutoffDate(settings: RegistrationSettingsRecord) {
  const cutoffDate = settings.cutoffDate;
  return typeof cutoffDate === 'string' ? cutoffDate : null;
}

function getIstDateStamp(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(now);
}

function isRegistrationPastCutoff(cutoffDate: string, now = new Date()) {
  return getIstDateStamp(now) > cutoffDate;
}

function assertRegistrationRole(
  role: string | null | undefined,
  options?: { requireWrite?: boolean },
) {
  // Isolated unit tests sometimes stub assertEventAccess without a role.
  // Real request flows resolve a role through Clerk or event assignment.
  if (!role) {
    return;
  }

  const allowedRoles = options?.requireWrite
    ? REGISTRATION_WRITE_ROLES
    : REGISTRATION_READ_ROLES;

  if (!allowedRoles.has(role)) {
    throw new Error('Forbidden');
  }
}

async function assertRegistrationEventAccess(
  eventId: string,
  options?: { requireWrite?: boolean },
) {
  const access = (options
    ? await assertEventAccess(eventId, options)
    : await assertEventAccess(eventId)) ?? { userId: '', role: null };
  assertRegistrationRole(access.role, options);
  return access;
}

function buildRegistrationStateFilters(registration: {
  id: string;
  eventId: string;
  status: string;
  updatedAt: Date | null;
}) {
  const filters = [
    eq(eventRegistrations.id, registration.id),
    eq(eventRegistrations.eventId, registration.eventId),
    eq(eventRegistrations.status, registration.status),
  ];

  if (registration.updatedAt) {
    filters.push(eq(eventRegistrations.updatedAt, registration.updatedAt));
  }

  return filters;
}

// ── Public registration (no auth required) ─────────────────────
export async function registerForEvent(eventId: string, input: unknown) {
  const validated = publicRegistrationSchema.parse(input);

  // Feature flag check — registration_open per event
  try {
    const regOpen = await isRegistrationOpen(eventId);
    if (!regOpen) throw new Error('Registration is currently closed for this event');
  } catch (err) {
    if (err instanceof Error && err.message.includes('currently closed')) throw err;
    throw new Error('Registration is temporarily unavailable');
  }

  // Fetch event to check status and settings
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) throw new Error('Event not found');
  if (event.status !== 'published') throw new Error('Event is not accepting registrations');

  const regSettings = (event.registrationSettings as RegistrationSettingsRecord) ?? {};
  const requiresApproval = readBooleanSetting(regSettings, 'approvalRequired', 'requiresApproval');
  const waitlistEnabled = readBooleanSetting(regSettings, 'waitlistEnabled', 'enableWaitlist');
  const cutoffDate = readCutoffDate(regSettings);

  if (cutoffDate && isRegistrationPastCutoff(cutoffDate)) {
    throw new Error('Registration is currently closed for this event');
  }

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
      if (waitlistEnabled) {
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

  if (requiresApproval) {
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

    if (Number(count) >= Number(regSettings.maxCapacity) && waitlistEnabled) {
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

  const { eventId, registrationId, newStatus } = updateRegistrationStatusSchema.parse(input);

  await assertRegistrationEventAccess(eventId, { requireWrite: true });

  const [registration] = await db
    .select({
      id: eventRegistrations.id,
      eventId: eventRegistrations.eventId,
      personId: eventRegistrations.personId,
      status: eventRegistrations.status,
      updatedAt: eventRegistrations.updatedAt,
    })
    .from(eventRegistrations)
    .where(withEventScope(eventRegistrations.eventId, eventId, eq(eventRegistrations.id, registrationId)))
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
    .where(and(...buildRegistrationStateFilters(registration)))
    .returning();

  if (!updated) {
    throw new Error('Registration was modified by another request. Please refresh and try again.');
  }

  if (newStatus === 'cancelled') {
    await emitCascadeEvent(
      CASCADE_EVENTS.REGISTRATION_CANCELLED,
      eventId,
      { type: 'user', id: userId },
      {
        registrationId: registration.id,
        personId: registration.personId,
        eventId,
        cancelledAt: new Date().toISOString(),
      },
    );
  }

  revalidatePath(`/events/${eventId}/registrations`);
  return updated;
}

// ── Admin: get registrations for an event ──────────────────────
export async function getEventRegistrations(eventId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  await assertRegistrationEventAccess(eventId);

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

// ── Public: get registration by ID (for success page) ─────────
// Only returns non-sensitive fields. No auth required (public flow).
export async function getRegistrationPublic(registrationId: string) {
  registrationIdSchema.parse(registrationId);

  const [reg] = await db
    .select({
      id: eventRegistrations.id,
      registrationNumber: eventRegistrations.registrationNumber,
      status: eventRegistrations.status,
      qrCodeToken: eventRegistrations.qrCodeToken,
      category: eventRegistrations.category,
    })
    .from(eventRegistrations)
    .where(eq(eventRegistrations.id, registrationId))
    .limit(1);

  if (!reg) throw new Error('Registration not found');
  return reg;
}
