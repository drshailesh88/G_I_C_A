import { CASCADE_EVENTS, type CascadeEventName } from './events';

export async function resolveVariablesSnapshot(params: {
  personId: string;
  domainVariables: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const [{ db }, { people }, { eq }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/db/schema'),
    import('drizzle-orm'),
  ]);

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

function hasSnapshotVariables(payload: Record<string, unknown>): boolean {
  return Boolean(payload.variables && typeof payload.variables === 'object' && !Array.isArray(payload.variables));
}

function getSnapshotInput(
  eventName: CascadeEventName,
  payload: Record<string, unknown>,
): { personId: string; domainVariables: Record<string, unknown> } | null {
  const personId = typeof payload.personId === 'string' ? payload.personId : null;
  if (!personId) return null;

  switch (eventName) {
    case CASCADE_EVENTS.TRAVEL_SAVED:
      return {
        personId,
        domainVariables: {
          direction: payload.direction ?? null,
          travelMode: payload.travelMode ?? null,
          fromCity: payload.fromCity ?? null,
          toCity: payload.toCity ?? null,
          departureAtUtc: payload.departureAtUtc ?? null,
          arrivalAtUtc: payload.arrivalAtUtc ?? null,
        },
      };
    case CASCADE_EVENTS.TRAVEL_UPDATED:
      return {
        personId,
        domainVariables: {
          changeSummary:
            payload.changeSummary && typeof payload.changeSummary === 'object'
              ? payload.changeSummary
              : {},
        },
      };
    case CASCADE_EVENTS.TRAVEL_CANCELLED:
      return {
        personId,
        domainVariables: {
          cancelledAt: payload.cancelledAt ?? null,
          reason: payload.reason ?? null,
        },
      };
    case CASCADE_EVENTS.ACCOMMODATION_SAVED:
      return {
        personId,
        domainVariables: {
          hotelName: payload.hotelName ?? null,
          checkInDate: payload.checkInDate ?? null,
          checkOutDate: payload.checkOutDate ?? null,
          googleMapsUrl: payload.googleMapsUrl ?? null,
        },
      };
    case CASCADE_EVENTS.ACCOMMODATION_UPDATED:
      return {
        personId,
        domainVariables: {
          changeSummary:
            payload.changeSummary && typeof payload.changeSummary === 'object'
              ? payload.changeSummary
              : {},
        },
      };
    case CASCADE_EVENTS.ACCOMMODATION_CANCELLED:
      return {
        personId,
        domainVariables: {
          cancelledAt: payload.cancelledAt ?? null,
          reason: payload.reason ?? null,
        },
      };
    default:
      return null;
  }
}

export async function attachVariablesSnapshotIfNeeded(
  eventName: CascadeEventName,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (process.env.VITEST) {
    return payload;
  }

  if (hasSnapshotVariables(payload)) {
    return payload;
  }

  const snapshotInput = getSnapshotInput(eventName, payload);
  if (!snapshotInput) {
    return payload;
  }

  return {
    ...payload,
    variables: await resolveVariablesSnapshot(snapshotInput),
  };
}
