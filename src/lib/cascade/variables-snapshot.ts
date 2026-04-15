import { db } from '@/lib/db';
import { people } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function resolveVariablesSnapshot(params: {
  personId: string;
  domainVariables: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const [person] = await db
    .select({ email: people.email, phoneE164: people.phoneE164, fullName: people.fullName })
    .from(people)
    .where(eq(people.id, params.personId))
    .limit(1);

  const snapshot: Record<string, unknown> = {
    recipientEmail: person?.email ?? null,
    recipientPhoneE164: person?.phoneE164 ?? null,
    recipientName: person?.fullName ?? null,
    ...params.domainVariables,
  };

  return Object.freeze(snapshot);
}
