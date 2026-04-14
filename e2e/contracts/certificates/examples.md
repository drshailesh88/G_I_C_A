# Examples — certificates (credential issuance)
# Approved by: Shailesh Singh on 2026-04-14
# Status: FROZEN

Credential issuance is the highest-integrity surface after tenancy
isolation. Issuance is per-person per-event per-type with supersession
chains, revocation, and accreditation-grade verification. Bulk generation
is lock-protected. Numbers are globally unique via event-scoped prefix
(e.g. `GEM2026-ATT-00412`) and monotonic with gaps allowed.

## Example 1: Single issue — delegate attendance
**Given:** Event A has a delegate person `p1` with attendance record and an active `delegate_attendance` template.
**When:** Coordinator issues a certificate for `p1`.
**Then:**
- A row is inserted with `status=issued`, `certificate_type=delegate_attendance`, `certificate_number` matches `^[A-Z0-9]+-ATT-\d{5}$`, monotonically increments last sequence for the event+type.
- `verification_token` is a UUID v4.
- `storage_key` points to a private R2 path; no public URL on the row.
- `template_snapshot_json` and `rendered_variables_json` are non-null snapshots of the template + variables at issue time.
- `issued_at`, `issued_by` (Clerk user id) are set.

## Example 2: Regeneration creates a supersession chain (no revoke)
**Given:** `p1` has `cert_v1` with `status=issued` for event A, delegate_attendance.
**When:** Coordinator clicks "Regenerate" (e.g., to fix a typo in their name).
**Then:**
- `cert_v2` is inserted with `status=issued`, `supersedes_id=cert_v1.id`, a NEW `certificate_number` and NEW `verification_token`.
- `cert_v1.status=superseded`, `cert_v1.superseded_by_id=cert_v2.id`.
- `cert_v1` is NOT marked revoked.
- Public verify for `cert_v1` token returns `{ status: "superseded", superseded_by_certificate_number: cert_v2.number }`.
- Public verify for `cert_v2` token returns `{ status: "issued", certificate_number, issued_at, person_name, event_name }` with NO download link.
- Signed download URL for `cert_v2` works for Super Admin.

## Example 3: Revocation with reason
**Given:** `cert_v2` is the current valid cert for `p1` in event A.
**When:** Super Admin revokes with reason "duplicate attendance record later corrected".
**Then:**
- `cert_v2.status=revoked`, `revoked_at` set, `revoke_reason="duplicate attendance record later corrected"`, `revoked_by` set (Clerk user id).
- `cert_v2.superseded_by_id` remains null (revocation is separate from supersession).
- Public verify for `cert_v2` token returns `{ status: "revoked", revoke_reason, revoked_at }` with NO download link.
- Super Admin can still generate a signed download URL for forensic purposes.
- Audit log contains a `certificate.revoked` entry with actor, reason, timestamp, and cert id.

## Example 4: Bulk generate for delegate attendance
**Given:** Event A has 100 delegates with confirmed attendance.
**When:** Coordinator triggers bulk generation for `delegate_attendance`.
**Then:**
- Distributed Upstash lock `lock:certificates:generate:{eventId}:{type}` is acquired with 5-minute TTL.
- 100 rows are created with monotonic certificate numbers (gaps only from concurrent issuance, not from bulk).
- On completion (success or failure), the lock is released early (no need to wait for TTL).
- If 47 of 100 fail mid-batch, the 53 successes remain `issued`; failures are retryable via a "resume" action and do NOT leave orphan rows.
- Audit log has one row per successful issuance and one per failure with the failure reason.

## Example 5: Concurrent bulk generation is rejected
**Given:** Coordinator A has already started bulk generation for Event X / delegate_attendance 30 seconds ago; lock is held.
**When:** Coordinator B triggers bulk generation for the same (event, type).
**Then:**
- Response is HTTP 409 `{ error: "generation in progress", lock_holder: <userId>, started_at, expires_at }`.
- No rows are created by B's request.
- No duplicate certificate numbers are generated.

## Example 6: CME certificate with all required fields
**Given:** Event A is a 12-hour CME-accredited conference; `p1` attended 8 hours.
**When:** Coordinator issues a `cme_attendance` cert with variables `{ cme_credit_hours: 8, accrediting_body_name: "Medical Council of India", accreditation_code: "MCI-2026-GEM-001", cme_claim_text: "8 hours CME credit claimed" }`.
**Then:**
- Row is inserted with all 4 CME fields populated.
- `rendered_variables_json` contains all 4.
- `cme_credit_hours` (8) is ≤ event duration in hours (12). Valid.

## Example 7: Public verify endpoint returns certificate metadata
**Given:** A valid issued cert with verification token `T`.
**When:** Anyone GETs `/verify/T` (no auth).
**Then:**
- Response is 200 `{ status: "issued", certificate_number, certificate_type, person_name, event_name, issued_at }`.
- `verification_count` increments, `last_verified_at` updates.
- No PII beyond what appears on the certificate itself is returned (no phone, no email, no address, no internal person_id).
- No download link is returned.

## Example 8: Only one current valid cert per (person, event, type)
**Given:** `p1` has cert_v2 issued for event A, delegate_attendance.
**When:** Coordinator clicks "Regenerate" to make cert_v3.
**Then:**
- After the transaction: exactly one row with `status=issued` AND `certificate_type=delegate_attendance` AND `person_id=p1` AND `event_id=A`. Namely cert_v3.
- cert_v2 is `superseded`.
- The invariant `COUNT(*) WHERE status='issued' AND (person, event, type) = 1` holds across concurrent regens.

## Example 9: Ops and Read-only are denied all certificate actions
**Given:** Ops user and Read-only user both assigned to Event A.
**When:** Either navigates to `/events/A/certificates`.
**Then:**
- UI does not show "Generate" or "Revoke" buttons.
- Direct POST to any certificate API route returns 403 `{ error: "forbidden" }`.
- They can read the list (Read-only can, Ops cannot).
- Revoke endpoint rejects even with valid payload.

## Example 10: Template snapshot immutability
**Given:** cert_v1 was issued using template_v3 (JSON snapshot captured).
**When:** Coordinator later edits the template and saves template_v4.
**Then:**
- cert_v1's `template_snapshot_json` is unchanged and still reflects template_v3.
- Regenerating cert_v1 → cert_v2 uses template_v4's current state (fresh snapshot).
- Downloading cert_v1's signed PDF uses the v3 snapshot (forensic reconstruction possible).

## Example 11: Verification count and download count are independent
**Given:** cert_v1 is issued.
**When:** 5 people verify (hit public verify) and 2 downloads happen (signed URL fetches).
**Then:**
- `verification_count = 5`, `download_count = 2`.
- Neither counter affects the other.
- `last_verified_at` and `last_downloaded_at` update on the respective actions.
