# Invariants — certificates
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN

1. For every `(person_id, event_id, certificate_type)`, at most ONE row has `status='issued'`. ALWAYS true.
2. `certificate_number` is GLOBALLY UNIQUE across all events and all types. ALWAYS true.
3. Certificate number sequences are MONOTONIC per `(event_id, certificate_type)`; gaps are allowed; numbers are NEVER reissued. ALWAYS true.
4. `template_snapshot_json` is immutable after issuance. ALWAYS true.
5. `rendered_variables_json` is immutable after issuance. ALWAYS true.
6. A regenerated cert has `supersedes_id` = the old cert's id; the old cert's `status='superseded'` and `superseded_by_id` = the new cert's id. ALWAYS true.
7. Revocation is separate from supersession. A revoked cert has `status='revoked'`, non-null `revoked_at`, non-empty `revoke_reason`, non-null `revoked_by`; `superseded_by_id` is null. ALWAYS true.
8. Bulk generation is guarded by a distributed Upstash lock `lock:certificates:generate:{eventId}:{type}` with 5-minute TTL; lock is released on completion (success or failure); concurrent request returns HTTP 409. ALWAYS true.
9. Bulk generation is per-cert atomic: a failure on cert N leaves certs 1..N-1 issued and retryable; there are NEVER rows in a non-terminal intermediate status. ALWAYS true.
10. Public verify endpoint response body contains ONLY: `status`, `certificate_number`, `certificate_type`, `person_name`, `event_name`, `issued_at`, and optionally `revoked_at`, `revoke_reason`, `superseded_by_certificate_number`. ALWAYS true. Never a download URL. Never PII beyond what is on the certificate.
11. Public verify returns `status='revoked'` with `revoke_reason` and `revoked_at` for revoked certs. Transparent disclosure. ALWAYS true.
12. Public verify returns `status='superseded'` with `superseded_by_certificate_number` for superseded certs. ALWAYS true.
13. Only Super Admin can generate a working signed download URL for a revoked cert. Coordinators and below get 404. ALWAYS true.
14. `verification_count` and `download_count` are append-only counters; no API path decreases them. ALWAYS true.
15. CME certificate issuance requires all four fields: `cme_credit_hours > 0`, `accrediting_body_name`, `accreditation_code`, `cme_claim_text`; `cme_credit_hours ≤ event duration hours`. ALWAYS true.
16. Revocation requires a non-empty `revoke_reason`. ALWAYS true.
17. A certificate is only issuable to a person who has a row in `event_people` for the same `event_id`. ALWAYS true.
18. A certificate is not issuable for an event whose `state='archived'`. Existing certificates remain verifiable. ALWAYS true.
19. Ops and Read-only roles have zero write access to any certificate endpoint; they receive HTTP 403 on any POST/PATCH/DELETE. ALWAYS true.
20. Every issuance, regeneration, and revocation writes an audit log row with actor, timestamp, cert id, action, and (for revoke) reason. ALWAYS true.
21. All event-scoping rules from `eventid-scoping` apply: cross-event access returns 404; URL/body eventId mismatch returns 400 + Sentry. ALWAYS true.
