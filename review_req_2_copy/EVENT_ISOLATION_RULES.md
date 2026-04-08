# GEM India — Event Isolation Rules

**Status:** Canonical backend enforcement reference
**Date:** 2026-04-07
**Primary sources:** `.planning/data-requirements.md`, `SCHEMA_DECISIONS.md`, `AGENTS.md`

---

## Purpose

Every event-scoped record in GEM India must be isolated to the active event. This is a hard product rule, not a best practice.

If a record has `event_id`, every read, write, export, notification, job, and audit surface must honor it.

---

## Core Rules

1. Every event-scoped table must store `event_id`.
2. Every repository method for an event-scoped table must accept `eventId` explicitly.
3. Every `SELECT`, `UPDATE`, and logical `DELETE` on an event-scoped table must include `where event_id = :eventId`.
4. No API route may infer event scope from a child record ID alone.
5. Cross-event reads are super-admin only and must be intentionally separate code paths.
6. Event-scoped joins must join on both entity relationships and matching `event_id` when possible.
7. Background jobs must carry `eventId` in payload and recheck scoping before side effects.
8. Notification sends, red flags, exports, and reports must all remain event-scoped.

---

## Record Classes

### Global Records

These do not require `event_id`:
- `people`
- Clerk-managed auth identities
- global notification template defaults where `event_id` is null
- future organization-level records

### Event-Scoped Records

These always require `event_id`:
- `events`
- `halls`
- `event_user_assignments`
- `sessions`
- `session_role_requirements`
- `session_assignments`
- `faculty_invites`
- `program_versions`
- `event_registrations`
- `travel_records`
- `accommodation_records`
- `transport_batches`
- `vehicle_assignments`
- `transport_passenger_assignments`
- `certificate_templates`
- `issued_certificates`
- `notification_templates` when event override
- `notification_log`
- `notification_delivery_events`
- `automation_triggers`
- `red_flags`
- `attendance_records`

---

## Access Semantics

### Super Admin

- Can access all events
- May run cross-event reports explicitly
- Must still pass a concrete `eventId` for event-scoped repository methods

### Event Coordinator / Ops / Read-only

- May access only assigned events
- Must never hit unscoped event queries
- Event permissions are evaluated before data fetch when possible

---

## Repository Contract

Every repository/service method for event-scoped data must take `eventId` explicitly.

Good:

```ts
async function listTravelRecords(eventId: string, filters: TravelFilters) {
  return db.query.travelRecords.findMany({
    where: and(
      eq(travelRecords.eventId, eventId),
      applyTravelFilters(filters),
    ),
  });
}
```

Bad:

```ts
async function listTravelRecords(filters: TravelFilters) {
  return db.query.travelRecords.findMany({
    where: applyTravelFilters(filters),
  });
}
```

Good:

```ts
async function updateAccommodationRecord(
  eventId: string,
  recordId: string,
  patch: AccommodationPatch,
) {
  return db
    .update(accommodationRecords)
    .set(patch)
    .where(
      and(
        eq(accommodationRecords.id, recordId),
        eq(accommodationRecords.eventId, eventId),
      ),
    );
}
```

Bad:

```ts
async function updateAccommodationRecord(recordId: string, patch: AccommodationPatch) {
  return db
    .update(accommodationRecords)
    .set(patch)
    .where(eq(accommodationRecords.id, recordId));
}
```

---

## API Rules

1. Routes under event context must resolve active event first.
2. Input validation must require an event identifier or derive it from route params.
3. Handler logic must re-check event scope in the database query itself.
4. Never trust the client to send a valid child record for authorization.

Example pattern:

```ts
const { eventId } = params;
const input = schema.parse(await request.json());

await assertEventAccess({ clerkUserId, eventId, action: "update_travel" });

const record = await travelService.update(eventId, input.recordId, input.patch);
```

---

## Join Rules

### Person-linked event records

For records like registration, travel, accommodation, certificates, and logs:
- record must have `event_id`
- person must already belong to the event in a valid capacity where required

### Safe join pattern

```ts
and(
  eq(sessionAssignments.eventId, eventId),
  eq(sessionAssignments.personId, people.id),
)
```

### Unsafe join pattern

```ts
eq(sessionAssignments.personId, people.id)
```

This is unsafe because it allows accidental cross-event joins on shared global people rows.

---

## Mutation Rules

1. All event-scoped updates require `eventId` in the `where` clause.
2. All soft-cancel/soft-archive actions must preserve the row and audit trail.
3. Cascades never bypass event scoping.
4. Background-event handlers must verify that source and target rows belong to the same event before applying side effects.

---

## Reporting and Export Rules

- Every normal report is event-scoped.
- Export jobs must take `eventId` explicitly.
- Event archives are generated per event.
- Cross-event dashboards are reserved for super admin and must be clearly labeled as cross-event.

---

## Notification Rules

- Every `notification_log` row must carry `event_id`.
- Trigger execution must resolve recipients inside the same event.
- No template override may leak from one event into another.
- Logistics-only ops access must still be filtered by both category and event.

---

## Red Flag Rules

- Red flag source and target rows must belong to the same `event_id`.
- No red flag may be created across events even if the same global person exists in both events.

---

## Test Requirements

Every event-scoped module should have tests that prove:
- same record ID from another event cannot be read
- same record ID from another event cannot be mutated
- global person lookup does not leak unrelated event data
- background handlers refuse mismatched event payloads

---

## Non-Negotiable Review Checklist

Before merging event-scoped backend code, verify:
- method signature takes `eventId`
- query filters by `event_id`
- joins are event-safe
- route permission checks include event access
- background jobs preserve `eventId`
- tests cover cross-event rejection
