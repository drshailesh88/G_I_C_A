# GEM India — State Machines

**Status:** Canonical backend behavior reference
**Date:** 2026-04-07
**Primary sources:** `.planning/data-requirements.md`, `SCHEMA_DECISIONS.md`

---

## Purpose

This document freezes the allowed state transitions for the core operational workflows.

Rules:
- States are enforced in Zod validation and service-layer guards.
- High-impact transitions must be audited with actor and timestamp.
- `event_id` scoping is mandatory for every state transition on event-scoped records.
- Physical attendance is separate from registration status.

---

## 1. Registration

**Entity:** `event_registrations`

**States**
- `pending`
- `confirmed`
- `waitlisted`
- `declined`
- `cancelled`

**Initial state**
- If `event.registration_settings.requires_approval = true`: `pending`
- Otherwise: `confirmed`

**Allowed transitions**
- `pending -> confirmed`
- `pending -> declined`
- `pending -> waitlisted`
- `waitlisted -> confirmed`
- `waitlisted -> cancelled`
- `confirmed -> cancelled`

**Privileged reinstatement**
- `declined -> pending`
- `declined -> confirmed`
- `cancelled -> pending`
- `cancelled -> confirmed`

Only `Super Admin` may perform privileged reinstatement.

**Terminal behavior**
- `declined` and `cancelled` are operationally final for normal users.
- Check-in never changes registration state.

**Side effects**
- `pending -> confirmed` may trigger `registration.created` or `registration.confirmed` notification flow depending on event settings.
- `confirmed -> cancelled` triggers red-flag review on linked logistics records. No auto-delete, no auto-cancel of downstream logistics.

**Guardrails**
- One registration per `(event_id, person_id)`.
- `person_id` is always non-null.

---

## 2. Faculty Invite

**Entity:** `faculty_invites`

**States**
- `sent`
- `opened`
- `accepted`
- `declined`
- `expired`

**Initial state**
- `sent`

**Allowed transitions**
- `sent -> opened`
- `sent -> accepted`
- `sent -> declined`
- `sent -> expired`
- `opened -> accepted`
- `opened -> declined`
- `opened -> expired`

**Disallowed transitions**
- No reopen after `accepted`
- No reopen after `declined`
- No reopen after `expired`

**Notes**
- Invite workflow is per person per event responsibility bundle, not per assignment row.
- `accepted` does not mutate assignment truth; it confirms the bundle tied to the relevant program snapshot.

**Side effects**
- `sent` may emit notification sends.
- `accepted` may confirm downstream coordinator visibility.
- Revised responsibility notifications use a new notification cycle, not a back-transition on this state machine.

---

## 3. Red Flag

**Entity:** `red_flags`

**States**
- `unreviewed`
- `reviewed`
- `resolved`

**Initial state**
- `unreviewed`

**Allowed transitions**
- `unreviewed -> reviewed`
- `reviewed -> resolved`

**Privileged override**
- `unreviewed -> resolved`

Only `Super Admin` may perform direct resolve without intermediate review.

**Rules**
- No severity tiers in V1.
- One unresolved flag per `(event_id, target_entity_type, target_entity_id, flag_type)`.
- Review/resolve actions must capture actor and timestamp.

**Primary actors**
- `Ops` is the default operating role.
- `Event Coordinator` and `Super Admin` can also review/resolve.

---

## 4. Notification Delivery

**Entity:** `notification_log`

**States**
- `queued`
- `sending`
- `sent`
- `delivered`
- `read`
- `failed`
- `retrying`

**Initial state**
- `queued`

**Allowed transitions**
- `queued -> sending`
- `sending -> sent`
- `sent -> delivered`
- `delivered -> read`
- `queued -> failed`
- `sending -> failed`
- `sent -> failed`
- `delivered -> failed`
- `failed -> retrying`
- `retrying -> sending`

**Rules**
- Status progression updates the same row.
- Resend does not reuse the same row. It creates a new row with `is_resend = true` and `resend_of_id`.
- Raw provider callbacks belong in `notification_delivery_events`, not in `notification_log`.

**Provider nuances**
- Email may stop at `sent` or `delivered` depending on provider support.
- WhatsApp may advance to `read` if webhook support exists.
- `failed` can occur after `sent` if provider later reports bounce/rejection.

**Retry rules**
- Retry is allowed only from `failed`.
- Retry creates a new attempt on the same row only for provider-managed retry semantics.
- Manual resend always creates a new row.

---

## 5. Issued Certificate

**Entity:** `issued_certificates`

**States**
- `issued`
- `superseded`
- `revoked`

**Initial state**
- `issued`

**Allowed transitions**
- `issued -> superseded`
- `issued -> revoked`

**Disallowed transitions**
- `superseded -> issued`
- `revoked -> issued`
- `revoked -> superseded`

**Rules**
- Regeneration creates a new certificate row.
- The older row transitions `issued -> superseded`.
- Revocation is a correction/compliance action, never a delete.
- Only one current valid certificate per `(person_id, event_id, certificate_type)` at a time.

**Audit requirements**
- `revoked_at`
- `revoke_reason`
- actor (`issued_by` for create, explicit actor for revoke)

**Delivery**
- Delivery is not part of certificate state.
- Send history lives in `notification_log`.

---

## 6. Transport Batch

**Entity:** `transport_batches`

**States**
- `planned`
- `ready`
- `in_progress`
- `completed`
- `cancelled`

**Initial state**
- `planned`

**Allowed transitions**
- `planned -> ready`
- `planned -> cancelled`
- `ready -> in_progress`
- `ready -> cancelled`
- `in_progress -> completed`
- `in_progress -> cancelled`

**Disallowed transitions**
- No return from `completed`
- No return from `cancelled`

**Interpretation**
- `planned`: batch exists but not yet operationally finalized
- `ready`: passengers/vehicles are assigned and ops considers it dispatch-ready
- `in_progress`: pickup/drop is underway
- `completed`: run finished
- `cancelled`: batch invalidated, retained for audit

**Rules**
- System may suggest auto-generated batches, but humans finalize them.
- Cancelling a batch never deletes passenger history.

---

## 7. Vehicle Assignment

**Entity:** `vehicle_assignments`

**States**
- `assigned`
- `dispatched`
- `completed`
- `cancelled`

**Initial state**
- `assigned`

**Allowed transitions**
- `assigned -> dispatched`
- `assigned -> cancelled`
- `dispatched -> completed`
- `dispatched -> cancelled`

**Disallowed transitions**
- No return from `completed`
- No return from `cancelled`

**Rules**
- A vehicle belongs to exactly one batch row at a time.
- Cancelling a vehicle assignment unassigns linked passengers from the vehicle, but does not delete passenger rows.

---

## 8. Transport Passenger Assignment

**Entity:** `transport_passenger_assignments`

**States**
- `pending`
- `assigned`
- `boarded`
- `completed`
- `no_show`
- `cancelled`

**Initial state**
- `pending`

**Allowed transitions**
- `pending -> assigned`
- `pending -> cancelled`
- `assigned -> boarded`
- `assigned -> no_show`
- `assigned -> cancelled`
- `boarded -> completed`
- `boarded -> cancelled`

**Operational override**
- `pending -> boarded`

Allowed only for manual ops correction when the person was boarded without a clean assignment update.

**Rules**
- Passenger row requires `event_id`, `batch_id`, `person_id`, and `travel_record_id`.
- `vehicle_assignment_id` may remain null while the person is still unassigned to a specific vehicle.
- `no_show` is terminal for that assignment row.

---

## Implementation Notes

- Every transition should be implemented in dedicated service methods, not ad hoc `db.update()` calls.
- Every privileged transition should require actor context.
- Status transitions that produce notifications or red flags must emit canonical Inngest events.
