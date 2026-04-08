# GEM India — Cascade Event Map

**Status:** Canonical backend eventing reference
**Date:** 2026-04-07
**Primary sources:** `.planning/data-requirements.md`, `SCHEMA_DECISIONS.md`, `DESIGN_DECISIONS.md`

---

## Purpose

This document freezes the domain events, payload shape, consumer behavior, and idempotency rules for cross-module side effects.

Rules:
- Business modules emit canonical domain events.
- Downstream side effects run through Inngest consumers.
- Every event payload must include `eventId`.
- Every consumer must be idempotent.

---

## Naming Convention

Use:

`conference/<domain>.<action>`

Examples:
- `conference/travel.updated`
- `conference/accommodation.cancelled`
- `conference/program.version_published`

---

## Event Envelope

All cascade events should include this common envelope:

```ts
type CascadeEnvelope<TPayload> = {
  id: string;
  name: string;
  occurredAt: string;
  eventId: string;
  actor: {
    type: "user" | "system";
    id: string;
  };
  payload: TPayload;
};
```

For background jobs, use system actors like `system:inngest`.

---

## 1. Travel Saved

**Event**
- `conference/travel.saved`

**Producer**
- travel service on initial confirmed save

**Payload**

```ts
type TravelSavedPayload = {
  travelRecordId: string;
  personId: string;
  registrationId?: string | null;
  direction: "inbound" | "outbound" | "intercity" | "other";
  travelMode: string;
  fromCity: string;
  toCity: string;
  departureAtUtc: string;
  arrivalAtUtc: string;
  pickupHub?: string | null;
  terminalOrGate?: string | null;
};
```

**Consumers**
- create or refresh transport batch suggestions
- optionally send initial travel itinerary notifications
- update ops-facing derived boards

**Idempotency key**
- `travel:saved:{eventId}:{travelRecordId}`

---

## 2. Travel Updated

**Event**
- `conference/travel.updated`

**Producer**
- travel service on meaningful itinerary change

**Payload**

```ts
type TravelUpdatedPayload = {
  travelRecordId: string;
  personId: string;
  registrationId?: string | null;
  previous: {
    arrivalAtUtc?: string | null;
    departureAtUtc?: string | null;
    fromCity?: string | null;
    toCity?: string | null;
    terminalOrGate?: string | null;
  };
  current: {
    arrivalAtUtc?: string | null;
    departureAtUtc?: string | null;
    fromCity?: string | null;
    toCity?: string | null;
    terminalOrGate?: string | null;
  };
  changeSummary: Record<string, { from: unknown; to: unknown }>;
};
```

**Consumers**
- create/update accommodation red flag
- recalculate transport suggestions and passenger planning impacts
- send delegate travel-change notification if enabled

**Idempotency keys**
- red flag consumer:
  `redflag:travel-updated:{eventId}:{travelRecordId}:{targetType}:{targetId}`
- transport recalculation:
  `transport-recalc:travel-updated:{eventId}:{travelRecordId}`
- notification:
  `notify:travel-updated:{eventId}:{personId}:{travelRecordId}:{channel}`

---

## 3. Travel Cancelled

**Event**
- `conference/travel.cancelled`

**Producer**
- travel service on soft cancel

**Payload**

```ts
type TravelCancelledPayload = {
  travelRecordId: string;
  personId: string;
  registrationId?: string | null;
  cancelledAt: string;
  reason?: string | null;
};
```

**Consumers**
- create accommodation red flag
- create transport red flag / unassignment review
- send delegate cancellation notification if enabled

**Idempotency key**
- `travel-cancelled:{eventId}:{travelRecordId}:{consumer}`

---

## 4. Accommodation Saved

**Event**
- `conference/accommodation.saved`

**Producer**
- accommodation service on initial confirmed save

**Payload**

```ts
type AccommodationSavedPayload = {
  accommodationRecordId: string;
  personId: string;
  registrationId?: string | null;
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
  googleMapsUrl?: string | null;
};
```

**Consumers**
- send accommodation details notification
- refresh transport planning context

**Idempotency key**
- `accommodation-saved:{eventId}:{accommodationRecordId}:{consumer}`

---

## 5. Accommodation Updated

**Event**
- `conference/accommodation.updated`

**Producer**
- accommodation service on meaningful logistics change

**Payload**

```ts
type AccommodationUpdatedPayload = {
  accommodationRecordId: string;
  personId: string;
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
  changeSummary: Record<string, { from: unknown; to: unknown }>;
  sharedRoomGroup?: string | null;
};
```

**Consumers**
- create/update transport red flag
- send updated accommodation notification
- if shared room group changed, flag all linked occupants

**Idempotency key**
- `accommodation-updated:{eventId}:{accommodationRecordId}:{consumer}`

---

## 6. Accommodation Cancelled

**Event**
- `conference/accommodation.cancelled`

**Producer**
- accommodation service on soft cancel

**Payload**

```ts
type AccommodationCancelledPayload = {
  accommodationRecordId: string;
  personId: string;
  cancelledAt: string;
  reason?: string | null;
};
```

**Consumers**
- create transport red flag
- send delegate cancellation/update notification

**Idempotency key**
- `accommodation-cancelled:{eventId}:{accommodationRecordId}:{consumer}`

---

## 7. Registration Cancelled

**Event**
- `conference/registration.cancelled`

**Producer**
- registration service on `confirmed -> cancelled` or `waitlisted -> cancelled`

**Payload**

```ts
type RegistrationCancelledPayload = {
  registrationId: string;
  personId: string;
  previousStatus: "pending" | "confirmed" | "waitlisted";
  currentStatus: "cancelled";
};
```

**Consumers**
- create review flags on linked travel, accommodation, and transport records
- do not auto-delete or auto-cancel downstream records

**Idempotency key**
- `registration-cancelled:{eventId}:{registrationId}:{consumer}`

---

## 8. Session Cancelled

**Event**
- `conference/session.cancelled`

**Producer**
- session service on soft cancel

**Payload**

```ts
type SessionCancelledPayload = {
  sessionId: string;
  sessionTitle: string;
  affectedPersonIds: string[];
};
```

**Consumers**
- send notification to all assigned faculty

**Idempotency key**
- `session-cancelled:{eventId}:{sessionId}:{personId}:{channel}`

---

## 9. Program Version Published

**Event**
- `conference/program.version_published`

**Producer**
- program version publish service

**Payload**

```ts
type ProgramVersionPublishedPayload = {
  programVersionId: string;
  versionNo: number;
  baseVersionId?: string | null;
  affectedPersonIds: string[];
  changesSummary: {
    addedSessions: unknown[];
    removedSessions: unknown[];
    movedSessions: unknown[];
    assignmentChanges: unknown[];
    tbaFilled: unknown[];
    tbaReopened: unknown[];
  };
};
```

**Consumers**
- send revised responsibility notifications to affected faculty
- update program-version notification status

**Idempotency key**
- `program-version-published:{eventId}:{programVersionId}:{personId}:{channel}`

---

## 10. Certificate Generated

**Event**
- `conference/certificate.generated`

**Producer**
- certificate generation service after successful issuance row + file write

**Payload**

```ts
type CertificateGeneratedPayload = {
  issuedCertificateId: string;
  personId: string;
  certificateType: string;
  certificateNumber: string;
};
```

**Consumers**
- send certificate-ready notification

**Idempotency key**
- `certificate-generated:{eventId}:{issuedCertificateId}:{channel}`

---

## 11. Transport Changed

**Event**
- `conference/transport.updated`

**Producer**
- transport service when batch, vehicle, or passenger assignment changes in a way that affects a traveler

**Payload**

```ts
type TransportUpdatedPayload = {
  batchId: string;
  vehicleAssignmentId?: string | null;
  passengerAssignmentId?: string | null;
  personId?: string | null;
  changeSummary: Record<string, { from: unknown; to: unknown }>;
  pickupDetailsSentPreviously: boolean;
};
```

**Consumers**
- refresh ops board counts
- send pickup update notification only if details were previously sent
- append audit timeline entry

**Idempotency key**
- `transport-updated:{eventId}:{targetId}:{consumer}`

---

## Consumer Rules

1. Consumers must re-fetch source rows by `eventId`.
2. Consumers must refuse mismatched-event target rows.
3. Notification consumers must go through `lib/notifications/*`.
4. Red-flag consumers must enforce unresolved-flag uniqueness.
5. Recalculation consumers must be safe to run multiple times.

---

## Event-to-Effect Summary

| Source Event | Downstream Effects |
|---|---|
| `conference/travel.saved` | transport suggestions, optional travel send |
| `conference/travel.updated` | accommodation flag, transport recalculation, delegate notification |
| `conference/travel.cancelled` | accommodation flag, transport review, delegate notification |
| `conference/accommodation.saved` | accommodation notification, transport context refresh |
| `conference/accommodation.updated` | transport flag, delegate notification, shared-room flags |
| `conference/accommodation.cancelled` | transport flag, delegate notification |
| `conference/registration.cancelled` | review flags on logistics, no auto-delete |
| `conference/session.cancelled` | faculty notification |
| `conference/program.version_published` | revised responsibility notifications |
| `conference/transport.updated` | board refresh, optional traveler notification, audit |
| `conference/certificate.generated` | certificate-ready notification |

---

## Explicit Non-Goals

- No upstream cascades
- No direct provider calls from page or route handlers
- No cross-event cascade fan-out
- No automatic vehicle assignment in V1
