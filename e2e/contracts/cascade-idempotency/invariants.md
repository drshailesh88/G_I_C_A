# Invariants — cascade-idempotency
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN

1. Every notification send is guarded by a Redis idempotency key of the form `notification:{userId}:{eventId}:{type}:{triggerId}:{channel}` where channel ∈ {email, whatsapp}. ALWAYS true.
2. The SAME idempotency key is used across all retry attempts of the same logical send. ALWAYS true.
3. `notification_log` has EXACTLY ONE row per idempotency key. Retry attempts UPDATE this row; they never insert a new row. ALWAYS true.
4. `notification_log.attempts` only increments; never resets, never decrements. ALWAYS true.
5. A cascade event emitted at time T is handled with the payload snapshot captured at T. Subsequent DB changes to the same source entity do NOT mutate the sent notification's content. ALWAYS true.
6. Rapid mutations to the same source entity within a 5-second debounce window produce ONE aggregated cascade event with a combined `changeSummary`, not multiple events. ALWAYS true.
7. Debounce keys are granular per `(eventId, sourceEntityType, sourceEntityId)`. Two different source entities never share a debounce window. ALWAYS true.
8. Each cascade event fans out to one or more INDEPENDENT Inngest functions. Failure of one function does NOT affect sibling functions. ALWAYS true.
9. Each Inngest handler has a retry budget of 3 attempts with exponential backoff. On final failure: Sentry event emitted + `notification_log.status='failed'` + a red flag of type `system_dispatch_failure` is created for ops. ALWAYS true.
10. No end-user notification is sent when a cascade fails. Failure is an ops concern. ALWAYS true.
11. Payload validation (Zod) runs at handler entry. On validation failure: the event is dead-lettered on the first attempt (no retry), Sentry captures the malformed payload. ALWAYS true.
12. Handlers are domain-idempotent by design: red-flag creation upserts (data-req §19); transport recalc uses last-write-wins; DB writes use deterministic primary keys derived from payload. ALWAYS true.
13. Every handler query (except global `people` reads) filters by `eventId`. ALWAYS true.
14. An in-flight cascade whose event was emitted BEFORE an event state transition to `archived` completes normally. New mutations on an archived event are blocked at the server-action level (never emit cascade events). ALWAYS true.
15. A notification marked `status=failed` after retry exhaustion is never subsequently sent. Replaying the Inngest event is a no-op for that send. ALWAYS true.
16. A notification send's rendered variables are captured as a snapshot at emit time and reused across retry attempts. Retry never recomputes variables from current DB state. ALWAYS true.
17. `red_flags` has at most one active (not resolved) row per `(event_id, target_entity_type, target_entity_id, flag_type)`. ALWAYS true.
18. The upstream mutation that triggers a cascade is NEVER rolled back because a downstream cascade function fails. Primary data independence. ALWAYS true.
19. Email and WhatsApp sends within one logical cascade use independent idempotency keys (suffix `:email` vs `:whatsapp`). Failure in one channel does not block retry in the other. ALWAYS true.
20. Recipient resolution in the handler uses the registration / event_people row belonging to the cascade's `eventId`; never a cross-event registration. ALWAYS true.
