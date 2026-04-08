# GEM India — Database Decisions (Owner-Spec Aligned)

> Source baseline: `/Users/shaileshsingh/Downloads/document_pdf.pdf` (owner request, 2026-04-04)
> Purpose: historical bridge document used during `/data-grill` and early `/db-architect` work.
> Status: Superseded on 2026-04-07.
>
> Canonical replacements:
> - `/Users/shaileshsingh/G_I_C_A/SCHEMA_DECISIONS.md`
> - `/Users/shaileshsingh/G_I_C_A/STATE_MACHINES.md`
> - `/Users/shaileshsingh/G_I_C_A/EVENT_ISOLATION_RULES.md`
> - `/Users/shaileshsingh/G_I_C_A/CASCADE_EVENT_MAP.md`
> - `/Users/shaileshsingh/G_I_C_A/SERVICE_CONTRACTS.md`
>
> Do not use this file as the current source of truth for new implementation.

---

## 1) Tech-Stack Reconciliation (Owner vs Current Build)

Owner PDF suggests generic options (`PHP/Laravel`, `MySQL/PostgreSQL`, SMTP/WABA providers).  
Current build uses `Next.js + Clerk + Drizzle + Neon Postgres`.

Decision:
- Keep current stack.
- Treat owner tech section as non-binding implementation preference, not product requirement.
- Database semantics required by owner are fully compatible with Postgres + Drizzle.

Why this is safe:
- Owner requirements are domain/flow requirements, not framework-coupled.
- Postgres gives strong constraints, indexing, JSON support, and auditing capabilities needed for red-flag cascade and per-event isolation.

---

## 2) Non-Negotiable Data Invariants

These are mandatory and should be enforced in schema + service layer.

1. `Person` is global; event participation is junction-based.
2. Every event-scoped record must carry `event_id` and be query-scoped by `event_id`.
3. Auth identity and person profile are separate (`auth_user` != `person`).
4. All outbound communications must produce a `notification_log` record.
5. Red-flag lifecycle is explicit (`unreviewed -> reviewed -> resolved`).
6. No hard delete for operational records; use soft delete/audit trail for accountability.
7. Time stored in UTC; display in IST/user timezone.

---

## 3) Canonical Core Entities

## 3.1 Identity and Access

- `auth_users`
  - `id` (pk, uuid)
  - `clerk_user_id` (unique)
  - `email`
  - `phone_e164`
  - `is_active`
  - `created_at`, `updated_at`

- `roles`
  - `id` (pk)
  - `key` (`super_admin`, `event_coordinator`, `ops`, `read_only`)
  - `name`

- `event_user_roles`
  - `id`
  - `event_id` (fk)
  - `auth_user_id` (fk)
  - `role_id` (fk)
  - unique (`event_id`, `auth_user_id`, `role_id`)

Note:
- If you keep global super admin semantics, allow `event_id` nullable for global assignment.

## 3.2 Master People and Event Participation

- `people` (global master DB)
  - `id` (pk, uuid)
  - `salutation` (`Dr`, `Prof`, etc.)
  - `full_name`
  - `designation`
  - `specialty`
  - `city`
  - `age` (nullable)
  - `email` (nullable)
  - `phone_e164` (nullable)
  - `source` (`import`, `registration`, `manual`)
  - `is_duplicate_candidate` (bool)
  - `merged_into_person_id` (nullable fk -> people.id)
  - `created_at`, `updated_at`

- `event_people`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `participant_type` (`delegate`, `faculty`, `both`)
  - `status` (`active`, `inactive`)
  - unique (`event_id`, `person_id`)

- `event_person_roles`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `role` (`speaker`, `chair`, `panelist`, `moderator`, `delegate`)
  - unique (`event_id`, `person_id`, `role`)

## 3.3 Events and Program

- `events`
  - `id` (pk, uuid)
  - `slug` (unique)
  - `name`
  - `venue_name`
  - `venue_address`
  - `start_date`, `end_date`
  - `timezone` (default `Asia/Kolkata`)
  - `status` (`draft`, `published`, `archived`)
  - `module_toggles_json` (jsonb)
  - `branding_profile_id` (nullable fk)
  - `created_by`, `updated_by`
  - `created_at`, `updated_at`

- `event_field_configs`
  - `id`
  - `event_id` (fk)
  - `scope` (`session`, `registration`)
  - `field_key`
  - `label`
  - `field_type` (`text`, `radio`, `dropdown`, `date`, `time`, `datetime`, `upload`, `number`)
  - `is_required`
  - `is_enabled`
  - `options_json` (jsonb, nullable)
  - unique (`event_id`, `scope`, `field_key`)

- `sessions`
  - `id`
  - `event_id` (fk)
  - `parent_session_id` (nullable fk -> sessions.id)  // sub-session support
  - `title`
  - `topic`
  - `hall`
  - `session_date`
  - `start_at_utc`
  - `end_at_utc`
  - `duration_mins`
  - `session_type` (`plenary`, `workshop`, `symposium`, `free_paper`, `break`, etc.)
  - `version_no`
  - `is_published`
  - `created_at`, `updated_at`

- `session_assignments`
  - `id`
  - `event_id` (fk)
  - `session_id` (fk)
  - `person_id` (fk)
  - `responsibility_role` (`speaker`, `chair`, `panelist`, `moderator`)
  - `assignment_status` (`proposed`, `sent`, `accepted`, `declined`, `updated`)
  - unique (`session_id`, `person_id`, `responsibility_role`)

- `program_revisions`
  - `id`
  - `event_id` (fk)
  - `revision_no`
  - `change_summary_json` (jsonb)
  - `published_at`
  - `published_by`
  - unique (`event_id`, `revision_no`)

## 3.4 Registration

- `registrations`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `registration_no` (unique)
  - `registration_type` (`delegate`, `faculty`)
  - `status` (`pending`, `confirmed`, `waitlisted`, `cancelled`, `checked_in`)
  - `source` (`self_register`, `faculty_invite`, `admin_add`)
  - `qr_token` (unique, nullable)
  - `travel_preference_json` (jsonb, nullable)
  - `created_at`, `updated_at`

- `faculty_invites`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `invite_token` (unique)
  - `invite_status` (`sent`, `opened`, `accepted`, `declined`, `expired`)
  - `sent_at`, `responded_at`, `expires_at`
  - `sent_by`

## 3.5 Communications and Branding

- `message_templates`
  - `id`
  - `event_id` (fk, nullable for global defaults)
  - `channel` (`email`, `whatsapp`)
  - `template_key` (`registration_confirmation`, `faculty_responsibilities`, etc.)
  - `name`
  - `subject` (nullable for WA)
  - `body`
  - `variables_json` (jsonb)
  - `is_active`
  - unique (`event_id`, `channel`, `template_key`)

- `notification_log`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `channel` (`email`, `whatsapp`)
  - `template_id` (fk, nullable)
  - `trigger_type` (`event_created`, `assignment_changed`, `travel_saved`, etc.)
  - `provider` (`resend`, `evolution_api`, `waba`)
  - `provider_message_id` (nullable)
  - `status` (`queued`, `sending`, `sent`, `delivered`, `failed`, `retrying`)
  - `idempotency_key` (unique)
  - `attempts`
  - `last_error` (nullable)
  - `last_attempt_at` (nullable)
  - `created_at`

- `branding_profiles`
  - `id`
  - `event_id` (fk, unique)
  - `logo_url`
  - `header_image_url`
  - `primary_color`
  - `secondary_color`
  - `from_name`
  - `letterhead_json` (jsonb)
  - `updated_at`

## 3.6 Logistics

- `travel_records`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `from_city`
  - `to_city`
  - `departure_at_utc`
  - `arrival_at_utc`
  - `pnr`
  - `ticket_no`
  - `travel_mode` (`flight`, `train`, `road`, `other`)
  - `attachment_url` (nullable)
  - `record_status` (`draft`, `sent`, `changed`, `cancelled`)
  - `created_at`, `updated_at`
  - index (`event_id`, `arrival_at_utc`)

- `accommodation_records`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `hotel_name`
  - `room_no`
  - `room_type` (nullable)
  - `address`
  - `check_in_date`
  - `check_out_date`
  - `booking_attachment_url` (nullable)
  - `google_maps_url` (nullable)
  - `record_status` (`draft`, `sent`, `changed`, `cancelled`)
  - `created_at`, `updated_at`

- `transport_batches`
  - `id`
  - `event_id` (fk)
  - `batch_date`
  - `slot_label` (e.g., `10:00`)
  - `arrival_city`
  - `terminal` (nullable)
  - `headcount`
  - `batch_status` (`unplanned`, `planned`, `dispatched`, `completed`)
  - `vehicle_id` (nullable)
  - `updated_at`
  - unique (`event_id`, `batch_date`, `slot_label`, `arrival_city`, `coalesce(terminal,'')`)

- `transport_batch_members`
  - `id`
  - `event_id` (fk)
  - `batch_id` (fk)
  - `person_id` (fk)
  - unique (`batch_id`, `person_id`)

- `red_flags`
  - `id`
  - `event_id` (fk)
  - `module` (`travel`, `accommodation`, `transport`)
  - `target_type` (`travel_record`, `accommodation_record`, `transport_batch`)
  - `target_id`
  - `flag_type` (`travel_change`, `cancelled`, `assignment_mismatch`, `other`)
  - `flag_detail`
  - `flag_status` (`unreviewed`, `reviewed`, `resolved`)
  - `created_by_system` (bool default true)
  - `reviewed_by` (nullable)
  - `reviewed_at` (nullable)
  - `resolved_by` (nullable)
  - `resolved_at` (nullable)
  - `created_at`

## 3.7 Certificates and Attendance

- `certificate_templates`
  - `id`
  - `event_id` (fk)
  - `name`
  - `template_json` (jsonb) // pdfme schema
  - `is_default`
  - `updated_at`

- `certificates`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `registration_id` (nullable fk)
  - `template_id` (fk)
  - `certificate_no` (unique)
  - `pdf_url`
  - `issued_at`
  - `delivery_status` (`pending`, `sent`, `failed`)
  - `revoked_at` (nullable)

- `attendance_scans`
  - `id`
  - `event_id` (fk)
  - `person_id` (fk)
  - `registration_id` (nullable fk)
  - `session_id` (nullable fk)
  - `hall` (nullable)
  - `scan_mode` (`qr`, `manual`)
  - `scan_result` (`accepted`, `duplicate`, `invalid`, `override`)
  - `scanned_at_utc`
  - `scanner_user_id` (fk auth_users)
  - `device_id` (nullable)
  - index (`event_id`, `scanned_at_utc`)

---

## 4) Required State Machines (Must Be Explicit Before Build)

1. `registration.status`
   - `pending -> confirmed -> checked_in`
   - `pending -> waitlisted -> confirmed`
   - `pending|confirmed -> cancelled`

2. `faculty_invites.invite_status`
   - `sent -> opened -> accepted|declined`
   - `sent|opened -> expired`

3. `red_flags.flag_status`
   - `unreviewed -> reviewed -> resolved`
   - no direct `unreviewed -> resolved` unless super_admin override

4. `notification_log.status`
   - `queued -> sending -> sent -> delivered`
   - any stage -> `failed` -> `retrying` -> `sending`

---

## 5) Per-Event Isolation Rules

Every repository method for event-scoped data must accept `event_id` explicitly.  
No implicit global reads allowed except `people`.

Hard rules:
1. API routes under `/events/[eventId]/*` enforce event context and role permission.
2. For tables with `event_id`, all `SELECT/UPDATE/DELETE` include `where event_id = :activeEventId`.
3. Cross-event reporting is super-admin only and explicitly labeled.
4. Junction tables (`event_people`, `event_user_roles`, `session_assignments`) always include `event_id` to prevent accidental cross-event joins.

---

## 6) Phase-Wise Database Deliverables

## Phase A — Foundation (`/data-grill` output)
- Final glossary of entities and statuses
- Field list and required/optional matrix
- Isolation rule sign-off
- State machine sign-off

## Phase B — Schema (`/db-architect`)
- Drizzle schema files for core + logistics + communications + attendance
- Migrations with indexes and unique constraints
- Seed data for role enums and template keys

## Phase C — Integrity
- Foreign keys and check constraints
- Unique indexes on:
  - `registrations.registration_no`
  - `faculty_invites.invite_token`
  - `notification_log.idempotency_key`
  - `certificates.certificate_no`
- Trigger or app-layer protection for immutable audit fields

## Phase D — Operational Hardening
- Soft-delete policy
- Audit trail write paths
- Red-flag auto-creation path
- Backfill and archive strategy for old events

---

## 7) Owner-Spec Gaps We Must Close in Grill

These are still ambiguous in the owner document and must be forced to decision:

1. Can one person hold multiple faculty roles in same session? (`speaker + chair`)
2. How strict is duplicate detection at import time vs merge-later policy?
3. What is the source of truth when travel preference (registration) differs from confirmed travel record?
4. Certificate revocation policy: hide vs mark revoked with reason?
5. Attendance granularity: event-level only or session-level mandatory?
6. Read-only role scope: all events vs assigned events only?
7. Archive retention period for PII-heavy records.

---

## 8) Immediate Recommendation

Before any further module implementation, run these in order:

1. `/data-grill` using this file as baseline and close Section 7 decisions.
2. `/db-architect` to freeze table/enum/index design.
3. Add `STATE_MACHINES.md` and `EVENT_ISOLATION_RULES.md` as hard references for all API/service code.
