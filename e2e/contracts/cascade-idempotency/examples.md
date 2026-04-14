# Examples — cascade-idempotency
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN

Inngest fan-out cascade. One upstream mutation emits ONE event that
triggers multiple independent Inngest functions. Notification sends are
guarded by a per-channel Redis idempotency key. Handlers are domain-
idempotent (red-flag upsert, last-write-wins transport recalc).

Cascade events: conference/travel.{created,updated}, accommodation.
{created,updated}, registration.created, session.updated, certificate.
generated.

## Example 1: travel.created fans out to a single itinerary notification
**Given:** Coordinator creates a travel record for delegate `p1` in Event A.
**When:** Server action commits the travel row.
**Then:**
- Exactly one `conference/travel.created` event is emitted with `{ personId: p1, eventId: A, travelId }`.
- The send-itinerary Inngest function runs once.
- Idempotency key `notification:p1:A:travel_confirmed:{travelId}:email` is set; likewise `...:whatsapp`.
- `notification_log` has one row per channel with `status=sent`, `attempts=1`.

## Example 2: travel.updated triggers three independent functions
**Given:** An existing travel record is edited (new arrival time).
**When:** Server action commits the update.
**Then:**
- One `conference/travel.updated` event emits with `{ personId, eventId, travelId, changes, changeHash }`.
- Three Inngest functions run in parallel:
  - flag-accommodation (creates/upserts a red flag on accommodation_record)
  - recalculate-transport (updates transport_passenger_assignment if any)
  - notify-delegate (sends revised itinerary email + whatsapp)
- Failure in any one function does NOT affect the other two.
- Each function has its own retry budget (3 attempts).

## Example 3: Debounce coalesces two rapid updates
**Given:** Coordinator saves the same travel record twice within 5 seconds (flight time change, then seat change).
**When:** The second save commits.
**Then:**
- Only ONE `conference/travel.updated` event is emitted (the debounce window coalesces).
- The payload's `changeSummary` contains both field diffs (flight_time and seat).
- Delegate receives ONE notification with both changes.
- `notification_log` has one row per channel, not two.

## Example 4: Retry on Resend failure — same idempotency key
**Given:** A `travel.created` handler attempts to send the itinerary email. Resend returns 503.
**When:** Inngest retries the function (attempts 1/3 → 2/3 → 3/3).
**Then:**
- All attempts use the SAME idempotency key `notification:p1:A:travel_confirmed:{travelId}:email`.
- `notification_log.attempts` increments on each attempt.
- `notification_log.last_error` records the error from the latest attempt.
- On success, `status='sent'`, `sent_at` timestamp recorded.
- On final failure (3/3): `status='failed'`, Sentry event emitted with full context, red flag type `system_dispatch_failure` created for ops.

## Example 5: Duplicate cascade event is a no-op
**Given:** Inngest re-delivers the same `conference/travel.created` event (e.g., due to its own retry of the handler function).
**When:** Handler runs a second time.
**Then:**
- The send attempt checks Redis for the idempotency key.
- Key exists → send is skipped.
- `notification_log.attempts` does NOT increment (the second invocation is detected as duplicate).
- No duplicate email or WhatsApp is sent.

## Example 6: Payload snapshot is taken at emit time
**Given:** Travel record shows arrival at `09:00 IST` when change is saved. The cascade emits. At T+10 seconds, another admin edits the arrival to `11:00 IST`.
**When:** The first notification is actually sent at T+20 seconds (after Inngest queue).
**Then:**
- The notification body shows `09:00 IST` (the payload-at-emit value), not `11:00 IST`.
- The second edit generates its own debounced cascade event, which sends its own notification with `11:00 IST`.
- Each notification is reproducible from its payload snapshot.

## Example 7: Cross-channel independence
**Given:** `registration.created` fires the confirmation notification.
**When:** Email send succeeds, WhatsApp send fails (Evolution API is down).
**Then:**
- Two notification_log rows: one with `channel=email, status=sent`; one with `channel=whatsapp, status=failed, attempts=3`.
- Email's idempotency key: `notification:{userId}:{eventId}:registration_confirmed:{registrationId}:email`.
- WhatsApp's key: `...:whatsapp`. Independent keys, independent retry.
- No email is resent on the WhatsApp retry (independent keys).

## Example 8: Red-flag upsert is idempotent
**Given:** Three rapid `accommodation.updated` events emit (debounce window missed because they were 6+ seconds apart).
**When:** The flag-transport handler runs three times.
**Then:**
- The red_flags table has exactly ONE active row for `(event_id, target_entity_type='transport_passenger_assignment', target_entity_id, flag_type='accommodation_change')` (per data-req §19).
- Subsequent handler runs update the flag's `flag_detail` and `source_change_summary_json` rather than creating duplicates.

## Example 9: Malformed cascade payload is dead-lettered
**Given:** An Inngest event arrives missing the `eventId` field (or with an unknown eventId).
**When:** The handler runs.
**Then:**
- Payload Zod validation fails.
- Handler throws a "payload_invalid" error; Inngest does NOT retry (we mark it non-retriable).
- Sentry event emitted with the raw payload.
- The event is dead-lettered on the first attempt.
- No DB writes, no notification sends.

## Example 10: In-flight cascades complete when event state transitions to archived
**Given:** Event A transitions to `archived` at T=100. A `travel.updated` cascade was emitted at T=95 and is still in Inngest's queue.
**When:** The handler runs at T=105.
**Then:**
- Handler completes normally (archived state blocks NEW mutations at the server-action level, but does NOT block in-flight cascades).
- Notification sends as normal.
- After this, any NEW `travel.updated` on this event is blocked at the server action (cannot mutate archived event).

## Example 11: Cross-event safety in handlers
**Given:** A `registration.created { eventId: A, personId: p1 }` event fires.
**When:** Handler looks up template to render the confirmation message.
**Then:**
- Template query filters by `event_id=A` (per eventid-scoping invariant 8).
- `people` table (global) is read freely for person master fields.
- Handler does NOT write to any table with `event_id != A`.
- If template for Event A is missing, handler fails with a specific error (not falling back to Event B's template).

## Example 12: Notification_log attempts counter increments correctly
**Given:** A notification send that ultimately succeeds on attempt 2.
**When:** The function completes.
**Then:**
- `notification_log` row: `attempts=2`, `status=sent`, `last_error` cleared (null), `sent_at` set.
- The row's id did NOT change between attempts (single row, updated, not inserted-per-attempt).
