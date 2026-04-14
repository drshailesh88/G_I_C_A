# Counterexamples — cascade-idempotency
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN

## CE1: Duplicate notification sent for the same trigger
**Never:** The same `(userId, eventId, type, triggerId, channel)` produces two successful sends.
**Why:** Spam + recipient trust loss.
**Test:** Fire the same cascade event 5 times. Assert exactly one row per channel in `notification_log` with `status=sent`; count of actual provider calls (Resend/Evolution) = 1 per channel.

## CE2: Cascade event fired for the same change twice (no debounce)
**Never:** Two successive saves within 5 seconds each emit an independent Inngest event.
**Why:** Recipient gets redundant messages with near-identical content.
**Test:** Two server actions save the same travel record 2 seconds apart. Assert exactly ONE `conference/travel.updated` event is emitted; its `changeSummary` aggregates both diffs.

## CE3: Retry uses a different idempotency key
**Never:** Retry attempts 1/3, 2/3, 3/3 use different keys.
**Why:** Breaks the "do not double-send" guarantee.
**Test:** Force Resend to 503 on attempt 1, success on attempt 2. Assert both attempts used the same key (via test-only Redis probe).

## CE4: Attempts counter resets or decreases
**Never:** `notification_log.attempts` resets to 1 on retry, or decrements.
**Why:** Corrupts audit trail.
**Test:** Force 2 failures then success. Assert final `attempts=3`; no intermediate row had `attempts < previous`.

## CE5: Notification sent after final-failure dead-letter
**Never:** A notification marked `status=failed` (after 3 exhausted attempts) is subsequently sent.
**Why:** Recipient gets the failed message days later, potentially with stale data.
**Test:** Run to 3/3 failure, confirm status=failed. Manually re-deliver the Inngest event. Assert no provider call is made; `notification_log.attempts` does not change.

## CE6: Partial cascade rollback (transactional coupling)
**Never:** A notification send failure causes the upstream mutation (e.g., travel row) to roll back.
**Why:** Primary data integrity must not depend on downstream comms health.
**Test:** Force notification to fail. Assert the travel row still exists, the red flag still exists, the transport recalc still persisted.

## CE7: Stale-payload send (lookup-at-send)
**Never:** A notification body reflects the current DB state rather than the snapshot captured at emit time.
**Why:** Between emit and send, more edits may have happened; using current state makes notifications unreproducible and breaks the debounce contract.
**Test:** Emit cascade with `arrival_time=09:00`. Before Inngest picks it up, update the row to `11:00`. Run the handler. Assert the sent body contains `09:00`, not `11:00`.

## CE8: Red flag duplication
**Never:** Multiple active unresolved flags for the same `(event_id, target_entity_type, target_entity_id, flag_type)`.
**Why:** Breaks data-req §19; clutters ops queue.
**Test:** Fire 3 `accommodation.updated` events on the same record outside the debounce window. Assert `COUNT(*) WHERE flag_status != 'resolved' AND (event, target, type) = 1`.

## CE9: Cascade handler writes to another event
**Never:** A handler triggered by `{eventId: A}` inserts or updates any row where `event_id != A`.
**Why:** Tenancy breach.
**Test:** Emit `travel.updated` for Event A; run handler. Assert no row in any table has been modified where `event_id = B` (by diffing state before/after).

## CE10: Handler retries on non-retriable errors
**Never:** Inngest retries after a payload-validation failure or a deterministic domain error (e.g., "person not attached to event").
**Why:** Retry won't fix malformed input; wastes queue time and masks the issue.
**Test:** Submit malformed payload. Assert exactly 1 attempt was made; event was dead-lettered; Sentry captured the error.

## CE11: Notification sent to wrong event's recipient
**Never:** A notification's recipient lookup returns a person from a different event's registration.
**Why:** Privacy + confusion.
**Test:** Person `p1` has `event_people` rows for A and B. Emit `registration.created` for A (referencing p1's A-registration). Assert the notification's recipient context is the A-registration, not B's.

## CE12: Idempotency key missing the channel segment
**Never:** An idempotency key omits the channel suffix (`:email` or `:whatsapp`) or uses a shared key for both channels.
**Why:** Retrying WhatsApp would also be blocked by a successful email key — user misses the WhatsApp message.
**Test:** Inspect every key used. Assert each ends with `:email` or `:whatsapp`. Force email success + whatsapp failure + retry. Assert whatsapp retry proceeds (not blocked by email's key).

## CE13: Two writers race on notification_log row (double increment)
**Never:** Concurrent retries of the SAME send both increment `attempts`, producing `attempts += 2` per provider call.
**Why:** Corrupts audit counts.
**Test:** Run two simultaneous handler invocations for the same send. Assert `attempts` equals the number of actual provider calls made (not double).

## CE14: Debounce window coalesces unrelated events
**Never:** Two `travel.updated` events for DIFFERENT travelIds within 5 seconds are coalesced.
**Why:** Debounce is per `(eventId, personId, travelId)`, not per event name.
**Test:** Save two different travel records 2 seconds apart. Assert TWO independent `conference/travel.updated` events were emitted, not one.

## CE15: System dispatch failure has no ops visibility
**Never:** A notification send that exhausts its retries produces no record visible to ops.
**Why:** Silent failure.
**Test:** Force 3/3 failures. Assert: (a) `notification_log.status=failed` and `last_error` populated; (b) Sentry event captured; (c) active red flag of type `system_dispatch_failure` exists for that target.

## CE16: End-user is notified of system dispatch failure
**Never:** A "we failed to notify you" message is sent to the end user.
**Why:** Per Q2 decision: no end-user failure notification. Ops handles the fallout.
**Test:** After 3/3 failure, inspect `notification_log` entries for that user. Assert no row has `type='dispatch_failure_user_notice'` or similar.

## CE17: Archived event blocks in-flight cascade
**Never:** An Inngest handler running for a cascade event emitted BEFORE state transition to `archived` refuses to proceed.
**Why:** Per Q8 decision: in-flight cascades complete.
**Test:** Emit cascade at T=0; archive event at T=1; run handler at T=2. Assert handler completes and notification sends.

## CE18: Notification log row inserted per attempt
**Never:** Each retry inserts a NEW row in notification_log.
**Why:** Per Q5: one row, updated per attempt. Multiple rows makes auditing harder.
**Test:** Force 2 failures + 1 success. Assert `COUNT(*) WHERE idempotency_key=... = 1`.

## CE19: Handler uses global (not event-scoped) query
**Never:** A cascade handler's query reads a non-`people` table without a `where event_id` clause.
**Why:** Tenancy breach + wrong-data risk.
**Test:** Mutation testing on handler code: removing a `.where(eq(table.eventId, ...))` must break an acceptance test.

## CE20: Variable snapshot is recomputed on retry
**Never:** Retry of a notification send computes fresh variable values from current DB state.
**Why:** Breaks reproducibility; user sees different content on each retry attempt if DB changed.
**Test:** Capture variable snapshot on attempt 1. Modify DB row between attempts. Assert attempt 2's rendered body uses the same snapshot values.
