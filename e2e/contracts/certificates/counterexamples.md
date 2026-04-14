# Counterexamples — certificates
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN

## CE1: Two current valid certs for same (person, event, type)
**Never:** After any sequence of issuances/regenerations/revocations, `COUNT(*) WHERE status='issued' AND person_id=p AND event_id=e AND certificate_type=t` > 1.
**Why:** Breaks the one-current-valid rule → external verifiers see two "current" certs.
**Test:** Race: fire 5 concurrent regenerations for same (p,e,t) → final state has exactly one `issued` row.

## CE2: Duplicate certificate number
**Never:** Two rows share the same `certificate_number`.
**Why:** Number is globally unique via event+type prefix. Duplicate = catastrophic integrity breach.
**Test:** Seed 10 events × 3 types × 50 certs. SELECT DISTINCT certificate_number count = total rows.

## CE3: Renumbered or compacted sequences
**Never:** After a cert is revoked or superseded, its number is reused.
**Why:** Breaks monotonicity; creates ambiguity ("which cert had #00412?").
**Test:** Issue #00410, #00411, #00412. Revoke #00411. Issue next → must be #00413, not #00411.

## CE4: Verification endpoint returns download link
**Never:** `GET /verify/[token]` response body contains a URL pointing to the PDF (signed or otherwise).
**Why:** Public verify is informational only. Downloads are for Super Admin + authenticated flows.
**Test:** All verify responses — assert body does not contain `pdf_url`, `storage_key`, `download_url`, or any URL string ending in `.pdf`.

## CE5: Revoked cert's public verify shows status=issued
**Never:** A revoked cert's public verify endpoint returns `status: "issued"`.
**Why:** Medical accreditation requires transparent revocation; external verifiers MUST see the revoked status.
**Test:** Revoke cert_X → GET `/verify/X_token` → body.status === "revoked", body.revoke_reason present, body.revoked_at present. Never "issued".

## CE6: Superseded cert verified as current
**Never:** A superseded cert's public verify returns `status: "issued"`.
**Why:** Supersession = this cert is no longer the current one.
**Test:** Regenerate cert_v1 → cert_v2. GET /verify/cert_v1.token → status "superseded", superseded_by_certificate_number = cert_v2.certificate_number.

## CE7: Concurrent bulk-generate creates duplicate batch
**Never:** Two coordinators running bulk generation for the same (event, type) simultaneously both produce rows.
**Why:** Duplicate cert per delegate; duplicate PDFs; duplicate emails.
**Test:** Hold lock via mock/manual acquisition; fire real bulk gen request → response 409, zero rows inserted.

## CE8: Lock TTL expires mid-batch without early release
**Never:** A bulk generation batch completes but the 5-minute lock is still held (wasting TTL).
**Why:** Blocks legitimate subsequent bulk runs for up to 5 minutes.
**Test:** Run bulk gen to completion → immediately retry bulk gen → succeeds (lock released on completion, not on TTL).

## CE9: Orphaned partial rows on bulk failure
**Never:** A bulk generation that fails leaves rows in an inconsistent intermediate state (e.g., `status=pending` forever).
**Why:** Intermediate states can be misread as valid.
**Test:** Inject failure at cert #47 of 100 → DB has 46 `issued` rows, 54 unfiled (retryable), ZERO rows with a non-terminal status.

## CE10: CME cert accepted with missing/invalid fields
**Never:** A `cme_attendance` issuance succeeds with any of these:
- `cme_credit_hours` missing, null, 0, negative, or > event duration hours
- `accrediting_body_name` missing or empty string
- `accreditation_code` missing or empty string
- `cme_claim_text` missing or empty string
**Why:** CME certs get audited by accreditation bodies; malformed = legal exposure.
**Test:** Attempt issuance with each violation → HTTP 400, Zod error pointing to the offending field, zero rows inserted.

## CE11: Template edit mutates past certificates
**Never:** Editing a template changes `template_snapshot_json` on any existing cert row.
**Why:** Snapshot immutability is the forensic contract.
**Test:** Hash cert_v1.template_snapshot_json → edit template → re-hash cert_v1.template_snapshot_json → hashes MUST match.

## CE12: Rendered variables mutate on cert row
**Never:** Any update to a person's master data (name change, email change) retroactively changes `rendered_variables_json` on an already-issued cert.
**Why:** Cert is an immutable legal record.
**Test:** Issue cert_v1 with name "Dr. Priya". Update person to "Dr. Priya Patel". Re-read cert_v1 → rendered_variables_json still shows "Dr. Priya".

## CE13: Public verify leaks PII
**Never:** The verify endpoint response contains `email`, `phone_e164`, `phone`, internal `person_id`, `registration_id`, full postal address, or any field not printed on the certificate itself.
**Why:** Public endpoint = public data surface.
**Test:** Every verify response body must pass a schema assertion that allows only: `status, certificate_number, certificate_type, person_name, event_name, issued_at, revoked_at?, revoke_reason?, superseded_by_certificate_number?`.

## CE14: Ops or Read-only issues a cert
**Never:** A user with role `ops` or `read_only` successfully issues, revokes, or regenerates a cert.
**Why:** Per data-requirements §18: Ops + Read-only have NO certificate management.
**Test:** Authenticated ops user POSTs to every cert mutation endpoint → 403 for each. Zero rows affected.

## CE15: Revoke without reason
**Never:** A revoke succeeds without a non-empty `revoke_reason`.
**Why:** Compliance requirement.
**Test:** POST revoke with `{}`, `{reason: ""}`, `{reason: "  "}` → 400 for each. Cert stays `issued`.

## CE16: Cross-event cert issuance
**Never:** A coordinator of Event A issues a cert under Event A for a person who is only attached to Event B.
**Why:** Per data-requirements §18: "Only issuable to people already attached to the event."
**Test:** person_p1 has `event_people(event_id=B)` only. Coord_A POSTs issuance for p1 → 400 "person not attached to this event".

## CE17: Revoked cert signed URL works for non-Super-Admin
**Never:** A Coordinator (or any non-super-admin) obtains a working signed download URL for a revoked cert.
**Why:** Revocation = the cert is off-record for normal use. Only forensic access (Super Admin) permitted.
**Test:** Revoke cert_v1 → Coord_A requests signed URL → 404 or 403. Super Admin requests → signed URL returned and works.

## CE18: Verify endpoint counts manipulated
**Never:** The `verification_count` can decrement or be written by anyone other than the verify endpoint.
**Why:** Append-only audit metric.
**Test:** No PATCH/UPDATE API for the counters. Increment happens atomically inside the verify handler.

## CE19: Certificate issued for a soft-deleted/archived event
**Never:** A cert is issued for an event whose state is `archived`.
**Why:** Archived = fully read-only (data-requirements §89 "archived — fully read-only, preserved for reports and certificate verification").
**Test:** Event X state set to `archived` → POST issuance → 400 or 404. Note: existing certs REMAIN verifiable.

## CE20: Bulk gen retry duplicates the successful half
**Never:** Resuming a failed bulk gen re-issues rows that already succeeded on the previous run.
**Why:** Duplication.
**Test:** Bulk gen fails at #47 (46 issued). Retry same (event, type, scope) → only the remaining 54 are considered; the 46 are skipped because they already have current valid certs.
