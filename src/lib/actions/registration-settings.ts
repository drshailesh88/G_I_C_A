'use server';

import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { eventIdSchema, registrationSettingsSchema } from '@/lib/validations/event';
import { assertEventAccess } from '@/lib/auth/event-access';

export type UpdateRegistrationSettingsResult =
  | { ok: true }
  | { ok: false; status: 400; fieldErrors: Record<string, string[]>; formErrors: string[] };

export async function updateRegistrationSettings(
  eventId: string,
  input: unknown,
): Promise<UpdateRegistrationSettingsResult> {
  eventIdSchema.parse(eventId);

  const { userId } = await assertEventAccess(eventId, { requireWrite: true });

  if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.keys(input as object).length === 0) {
    return { ok: false, status: 400, fieldErrors: {}, formErrors: ['At least one setting field is required'] };
  }

  const parsed = registrationSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      status: 400,
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
      formErrors: flat.formErrors,
    };
  }

  await db
    .update(events)
    .set({
      registrationSettings: parsed.data,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/registration-settings`);

  return { ok: true };
}
