import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateRegistrationStatus } from '@/lib/actions/registration';

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  registrationId: z.string().uuid('Invalid registration ID'),
});

const bodySchema = z.object({
  newStatus: z.enum(['pending', 'confirmed', 'waitlisted', 'declined', 'cancelled']),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; registrationId: string }> },
) {
  const params = paramsSchema.parse(await context.params);
  const formData = await request.formData();
  const body = bodySchema.parse({
    newStatus: formData.get('newStatus'),
  });

  await updateRegistrationStatus({
    eventId: params.eventId,
    registrationId: params.registrationId,
    newStatus: body.newStatus,
  });

  return NextResponse.redirect(new URL(`/events/${params.eventId}/registrations`, request.url), 303);
}
