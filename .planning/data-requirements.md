# Data Requirements: GEM India Conference App
**Date:** 2026-04-07
**Source:** PRD + Final Synthesis + Backend Architecture Map + Design Decisions + data grilling session
**Status:** GRILLED — ready for database engineer

---

## Data Subjects

### 1. People (Master People Database)

**What it is:** The single record for any human the conference system interacts with — whether they're a delegate, speaker, sponsor, volunteer, or all of the above. One person, one record, reusable across events. Roles are per-event, not on the person record.
**Example:** Dr. Rajesh Sharma, Professor of Cardiology, AIIMS Delhi, mobile +919876543210, email rajesh.sharma@aiims.edu, tagged as VIP. He was a keynote speaker at GEM India 2025 and is registered as a delegate for GEM India 2026.

**Identity fields:**
- salutation — enum or short text: Dr, Prof, Mr, Mrs, Ms, Mx, Other (nullable)
- full_name — single field, no first/last split, max 200 chars, Unicode allowed, single-name valid
- email
- phone_e164 (normalized to E.164 on input via libphonenumber-js)
- designation (nullable)
- specialty (nullable)
- organization (nullable)
- city (nullable)
- tags — array for categorization (VIP, sponsor, volunteer, etc.)

**Name rules:**
- Name is not unique system-wide
- Allowed characters: letters, numbers, spaces, . , ' - ( ) /
- Trim leading/trailing spaces, collapse repeated internal spaces
- Salutation stored separately for reliable template variables: {{salutation}} {{full_name}}
- CSV import: attempt to parse prefix into salutation during preview, never block import

**Minimum required fields:** full_name + at least one of (email, phone_e164). No exceptions, no placeholder records.

**Four creation paths:**
1. Admin manual add
2. CSV import (bulk with column auto-mapping and Fuse.js fuzzy duplicate detection)
3. Public registration (self-register on event page)
4. Faculty invitation acceptance

**Deduplication rule (same for all paths):** Match on email OR mobile (normalized E.164). If match found, reuse existing record. If incoming data has updated fields, flag differences for admin review — never auto-overwrite. CSV import uses Fuse.js fuzzy matching to surface possible duplicates for admin review on merge screen.

**Lifecycle:**
- Created by: admin, CSV import, self-registration, or faculty invitation acceptance
- Updated by: admin manual edit, CSV import update, registration sync (admin-approved), merge, invitation sync
- Archived by: Super Admin or Event Coordinator
- Archive behavior: sets archived/inactive state. Person disappears from active lists, searches, pickers. Remains visible in historical records with "Archived" badge. Real name preserved — never replaced with "Deleted User"
- Restore: Super Admin can restore anytime
- Anonymize: Super Admin can irreversibly anonymize (name → "Anonymized", email/mobile hashed). Row persists for referential integrity. GDPR-safe alternative to hard delete.
- Hard delete: NEVER in normal operations. Only for mistaken duplicates/empty records with no operational references, or as part of controlled merge flow.
- Only Super Admin can archive or anonymize. Event Coordinators and Ops cannot.

**History tracking:**
- Full change history via Bemi (automatic DB-level capture)
- Visible "Change History" section on Person Detail screen
- Accessible to: Super Admin and Event Coordinator
- Each entry shows: timestamp, actor (Clerk user), action (create/update/merge/import_update), field-level diff, source
- Five source types: manual_edit, csv_import, registration_sync, merge, invitation_sync
- Audit log is immutable — no edit/delete from UI
- Retention: full history for lifetime of the system

**Ownership & Access:**
- Global record, not owned by any single event
- Reusable across unlimited events simultaneously
- No cross-event exclusivity rules
- Access governed by role: Super Admin sees all, others see event-scoped views

**Limits:**
- No business maximum — cumulative across years/events (50,000+ acceptable)
- Performance handled technically: server-side pagination, indexed search, async imports

**Search & Filter:**
- Search: full_name (partial, case-insensitive), email (partial + domain), phone_e164 (exact + last 10-digit India format), organization, city, specialty
- Filters: participant_type (delegate/faculty/both), role tags, city, organization, specialty, event linkage
- Sort: name A-Z, newest added, recently updated, city A-Z
- Saved views: All People, Faculty, Delegates, Sponsors, VIPs, Recently Added

**Billing impact:** None — no billing model in V1

**Future expansion:**
- Organization-scoped people views when multi-tenancy is added
- Self-service profile correction workflow for delegates
- Richer dedup with ML-based matching

---

### 2. Events

**What it is:** A single conference instance (name, dates, venue, branding, timezone) that acts as the primary data boundary for program, people assignments, registration, communications, logistics, certificates, attendance, reports, and module toggles.
**Example:** GEM India National Conference 2026, March 15-17, AIIMS Auditorium New Delhi, IST timezone, with sessions, registration, travel, accommodation, and certificates all enabled.

**Fields:**
- Core: id, slug, name, description, start_date, end_date, timezone, status, archived_at
- Venue: venue_name, venue_address, venue_city, venue_map_url
- Module toggles (JSONB): sessions, scientific_program, registration, travel, accommodation, transport, certificates, qr_attendance, reports
- Field config (JSONB): configurable event fields and visibility/required flags for session + registration forms
- Branding (JSONB): primary_color, accent_color, logo_url, header_image_url, sender_display_name, letterhead_footer_text
- Registration settings (JSONB): is_open, requires_approval, capacity, waitlist_enabled, registration_cutoff_date, preference_fields_enabled
- Communication settings (JSONB): email_enabled, whatsapp_enabled, sender_email_display_name
- Public page settings (JSONB): landing_page_enabled, show_speakers, show_schedule, show_venue_map
- Audit: created_by, updated_by, created_at, updated_at

**Five lifecycle states:**
1. draft — being set up, no public page, no registrations, only visible to admins
2. published — live, public page active, registrations open if enabled, full operational use
3. completed — event dates passed, limited edits (certificates, attendance fixes, post-event comms), no new registrations, public page shows "Event Ended"
4. archived — fully read-only, preserved for reports and certificate verification
5. cancelled — terminal state, all operations stopped, data preserved for audit

**State transitions:**
- draft → published: explicit Publish action by Super Admin or Event Coordinator
- published → completed: automatically on end_date + 1 day, manual override available
- completed → archived: manually by Super Admin, or auto after 90 days
- Any state except archived → cancelled: Super Admin only, audited
- cancelled → draft: Super Admin only, recovery path

**Allowed in completed state:** issue/resend certificates, fix attendance records, send post-event communications, export reports, view everything
**Blocked in completed state:** new registrations, session changes, travel/accommodation edits

**Creation:** Super Admin and Event Coordinator can create events. Ops and Read-only cannot.

**Per-event access control:**
- Global role in Clerk (super_admin, event_coordinator, ops, read_only)
- Event access via event_user_assignments table
- Super Admin sees all events automatically
- Event Coordinator sees events they created or are assigned to
- Ops and Read-only see only assigned events
- Fields: auth_user_id, event_id, assignment_type (owner/collaborator), assigned_at, assigned_by, is_active
- Ownership transfer: Super Admin only

**Duplication:**
- Duplicate Event action available to Super Admin and Event Coordinator
- New event created in draft state
- Admin must set new name, slug, start_date, end_date
- Copies: module toggles, field config, branding config, template bindings, session/hall structure as templates
- Does NOT copy: registrations, travel/accommodation/transport, certificates/attendance, notification logs, red flags, invite/QR tokens

**Deletion policy:** No hard delete. Archived and cancelled are lifecycle states, not data-destruction actions. All linked data stays intact. True hard delete only via super-admin compliance process with legal sign-off.

**Future expansion:**
- organization_id on events for multi-tenancy (model now, don't productize in V1)
- Category-level registration capacity (delegate, faculty, workshop slots)

---

### 3. Halls

**What it is:** A named physical space within an event venue where sessions take place.
**Example:** Hall A, capacity 500, sort_order 1 for GEM National 2026.

**Fields:**
- id, event_id, name, capacity (nullable), sort_order

**Purpose:** Prevents "Hall A" vs "Hall-A" typo duplicates. Gives clean grouping for schedule grid and attendance analytics.

---

### 4. Sessions

**What it is:** An event-scoped scheduled time block in a specific hall (scientific or service), with defined start/end, type, and optional faculty assignments.
**Example:** Keynote: Advances in Cardiac Imaging, March 15, 9:00-10:00 AM, Hall A, chaired by Dr. Mehta, with Dr. Sharma as speaker.

**Fields:**
- Core: id (UUID), event_id (FK), title, description (nullable)
- Time: start_at_utc, end_at_utc (display in local time derived from event.timezone)
- Location: hall_id (FK to halls table)
- Classification: session_type (enum: keynote, panel, workshop, free_paper, plenary, symposium, break, lunch, registration, other), track (nullable text), is_public (boolean, default true)
- Medical: cme_credits (nullable integer)
- Ordering: sort_order (integer)
- Hierarchy: parent_session_id (nullable self-FK for sub-sessions)
- Status: status (enum: draft, scheduled, completed, cancelled), cancelled_at (nullable)
- Audit: created_by, updated_by, created_at, updated_at

**Nesting:** One level only. Parent session → child sessions, no grandchildren. Enforced: parent_session_id must reference a session where parent_session_id is null.

**Creation:** Super Admin and Event Coordinator only, via manual add, event duplication (template copy), or CSV import. Ops and Read-only cannot create or edit.

**Deletion/cancellation:** Soft cancel only (status = cancelled, cancelled_at set). Faculty assignments on cancelled sessions stay as-is — session status is the single source of truth. Hard delete never allowed once any faculty assignment or notification log references the session.

**Conflict detection:**
- Faculty conflict: same person assigned to overlapping sessions in different halls
- Hall conflict: two sessions in the same hall at overlapping times
- Both are warnings by default, not hard blocks
- Inline conflict banners with details, allow save with warning, quick Fix action
- Optional future: per-event setting to upgrade selected conflicts to hard blocks

**Limits:** No business cap on sessions per event. 300+ sessions supported. Scale handled via day/hall filtering, indexed queries, virtualization/pagination.

**Program versioning:** Tracked in separate program_versions table as published snapshots, not per-session version numbers.

---

### 5. Session Role Requirements

**What it is:** A planning record that defines how many people of each role a session needs, enabling role-aware gap tracking.
**Example:** Session "Cardiac Imaging Symposium" needs 1 Chair, 1 Moderator, 3 Speakers.

**Fields:** session_id, role, required_count

**UI display:** "Speakers 2/3 assigned, Chair 1/1, Moderator 0/1" — role-aware gaps, not a single slot count.

**Rule:** Planning slots have no person_id. Actual assignments (session_faculty) always have a non-null person_id. Do not create fake assignment rows with person_id = null for TBA.

---

### 6. Session-Faculty Assignments

**What it is:** The event-scoped junction linking a person to a specific session with a defined responsibility role.
**Example:** Dr. Sharma is assigned as Keynote Speaker for "Advances in Cardiac Imaging" in Hall A on March 15.

**Fields:**
- id (UUID)
- event_id (FK)
- session_id (FK)
- person_id (FK) — always non-null
- role (enum: speaker, chair, co_chair, moderator, panelist, discussant, presenter)
- sort_order (presentation sequence within session)
- presentation_title (nullable)
- presentation_duration_minutes (nullable)
- notes (nullable, internal only)
- created_by, updated_by, created_at, updated_at

**Constraints:**
- Unique on (session_id, person_id, role) — same person can be speaker AND discussant in same session, but not speaker twice
- Index on (event_id, person_id)
- Index on (session_id, sort_order)

**No invitation status on this table.** Invitation/confirmation workflow tracked via separate faculty_invites table.

**Access:** Super Admin and Event Coordinator can create/update/delete. Ops can view only. Read-only views only.

**On session cancellation:** Assignments stay intact. Session status is the single source of truth. Cascade sends "session cancelled" notification to all assigned faculty.

---

### 7. Faculty Invites

**What it is:** A separate workflow record tracking the invitation and confirmation status for a faculty member's responsibility bundle in an event.
**Example:** Dr. Sharma invited for GEM National 2026, token sent, responsibilities: Keynote Speaker in Session A + Panelist in Session B. Status: accepted.

**Fields:**
- id
- event_id
- person_id
- token (unique invitation token)
- status (sent, opened, accepted, declined, expired)
- sent_at
- responded_at (nullable)
- program_version_snapshot (link to relevant program revision or assignment snapshot)

**Design rationale:**
- Keeps assignment table clean of workflow state
- Supports revised-responsibility mails cleanly
- V1 confirmation is for the whole responsibility bundle, not per individual assignment
- Leaves room for per-assignment RSVP later

**UI:** Show "confirmed / unconfirmed / declined" by joining to the latest invite record per person per event.

---

### 8. Registrations (event_registrations)

**What it is:** A per-event record linking a person to a specific event as a participant, capturing event-specific details like category, age, preferences, and QR token.
**Example:** Dr. Priya Patel registered for GEM National 2026 on Feb 10, as a delegate, age 42, vegetarian, prefers arrival on March 14, needs wheelchair access.

**Fields:**
- person_id (FK, non-null)
- event_id (FK)
- registration_number (auto-generated unique)
- category (enum: delegate, faculty, invited_guest, sponsor, volunteer)
- age (integer, captured at registration time)
- registered_at (timestamp)
- status (enum: pending, confirmed, waitlisted, declined, cancelled)
- preferences_json (travel date/time preferences, dietary needs, accessibility requirements)
- qr_code_token (unique string for check-in QR)
- Audit fields

**No payment fields.** Indian medical academic conferences handle payments offline or through institutional channels. Payment integration is out of scope.

**No ticket types.** Registration uses category (participation classification), not tiered ticketing.

**Status state machine:**
- If event requires_approval: new registration starts as pending
- If event does not require approval: starts directly as confirmed
- Transitions: pending → confirmed, pending → declined, pending → waitlisted, waitlisted → confirmed, waitlisted → cancelled, confirmed → cancelled
- declined and cancelled are operationally final, but Super Admin can reinstate to pending or confirmed
- Physical arrival tracked separately in attendance/check-in records, not registration status

**Uniqueness:** One registration per person per event, enforced by unique constraint on (event_id, person_id).

**Four creation paths:**
1. Self-registration on public event page
2. Admin manual add (Super Admin or Event Coordinator)
3. CSV import (bulk delegate lists)
4. Faculty invitation acceptance (creates/confirms registration)
- Ops and Read-only cannot create registrations

**On cancellation:** Connected records (travel, accommodation, transport) are NOT auto-deleted or auto-cancelled. Red-flag cascade triggers on related logistics records for ops review. Session-faculty assignments not touched.

**Capacity:** Optional per-event. If set, registrations beyond capacity go to waitlisted (if enabled) or blocked. Null capacity = unlimited. Scale target: 20,000+ registrations per event. Future: category-level capacity (delegate, faculty, workshop slots).

---

### 9. Travel Records

**What it is:** An event-scoped logistics record for one person's confirmed journey segment, storing mode, route, departure/arrival timing, booking references, and attached travel documents.
**Example:** Dr. Sharma, GEM National 2026: Flight AI-302, Delhi to Mumbai, March 14 at 10:30 AM, PNR ABC123, e-ticket PDF attached.

**Fields:**
- id
- event_id
- person_id
- registration_id (nullable — faculty may not have registration)
- direction (inbound, outbound, intercity, other)
- travel_mode (flight, train, car, bus, self_arranged, other)
- from_city
- from_location (airport/station/address, nullable)
- to_city
- to_location (airport/station/address, nullable)
- departure_at_utc
- arrival_at_utc
- carrier_name (nullable)
- service_number (flight/train/bus number, nullable)
- pnr_or_booking_ref (nullable)
- seat_or_coach (nullable)
- terminal_or_gate (nullable — important for airport pickups)
- attachment_url (nullable, R2 storage)
- record_status (draft, confirmed, sent, changed, cancelled)
- notes (internal only, nullable)
- created_by, updated_by, created_at, updated_at, cancelled_at (nullable)

**Multiple segments per person per event:** Yes, no limit. Each record is one leg (inbound flight, outbound flight, etc.).

**Creation:** Admin-managed only in V1. Super Admin, Event Coordinator, and assigned Ops via manual entry or CSV import. Delegates do not create/edit travel records. Future: delegate correction-request workflow.

**Cascade on update (conference/travel.updated):**
1. Red flag created on related accommodation records
2. Transport batch recalculation and reassignment
3. Personalized email/WhatsApp notification to traveler
4. Notification/audit logging of send results
- If no downstream records exist yet, cascade logs the change and skips safely
- If change is a cancellation, higher-severity red flag for ops review

**Deletion:** Soft cancel only (record_status = cancelled, cancelled_at set). No hard delete. Record stays for audit. Only Super Admin, Event Coordinator, and assigned Ops can cancel.

---

### 10. Accommodation Records

**What it is:** A per-person, per-event record capturing hotel name, room details, address, Google Maps URL, check-in/out dates, booking PDF, and red-flag status if linked travel changed.
**Example:** Dr. Sharma, GEM National 2026: Hotel Taj Mumbai, Room 412, Double Room, check-in March 14, check-out March 18, Google Maps link included, booking PDF attached.

**Fields:**
- id
- event_id
- person_id
- registration_id (nullable)
- hotel_name
- hotel_address
- hotel_city
- google_maps_url (nullable — included in delegate notifications for navigation)
- room_type (nullable)
- room_number (nullable — may not be assigned until closer to event)
- shared_room_group (nullable string/key for grouping shared occupants — handles 2, 3, or 4 occupants without circular references. V1 approach; upgrade to full room-assignment model later)
- check_in_date
- check_out_date
- booking_reference (nullable)
- attachment_url (nullable, R2 storage)
- special_requests (nullable)
- record_status (draft, confirmed, sent, changed, cancelled)
- notes (internal, nullable)
- created_by, updated_by, created_at, updated_at, cancelled_at (nullable)

**Creation:** Admin-managed only in V1. Super Admin, Event Coordinator, and assigned Ops via manual entry or CSV import from hotel rooming list spreadsheets. People picker auto-filters to those with existing travel records for the event.

**Cascade on update (conference/accommodation.updated):**
- Red flag on transport planning
- Notification to delegate with updated hotel details + map link
- No upstream cascade to travel

**Cascade on shared room change:** All linked occupants in the shared_room_group are flagged for review, not just the edited record.

**Deletion:** Soft cancel only. Same policy as travel. On cancellation, cascade raises red flags for transport/ops review.

**Cascade direction:** Travel → accommodation + transport. Accommodation → transport. No upstream cascades.

---

### 11. Transport Batches

**What it is:** An event-scoped operational grouping of people with materially similar movement needs, created from arrival/departure data using date, movement type, pickup/drop hub, and time window, so Ops can assign vehicles and drivers collectively.
**Example:** Mar 14 | Arrival | 08:00-10:00 | BOM T2 → Hotel Leela | Mumbai | 8 people | Assigned to Van-1 and Sedan-2.

**Fields:**
- id
- event_id
- movement_type (arrival, departure)
- batch_source (auto, manual)
- service_date
- time_window_start
- time_window_end
- source_city (traveler's origin/destination city from itinerary)
- pickup_hub (actual operational pickup point: BOM T2, Mumbai Central, Hotel Leela Lobby)
- pickup_hub_type (airport, railway_station, hotel, venue, other)
- drop_hub (Hotel Leela, Venue Gate A, BOM T2)
- drop_hub_type (hotel, venue, airport, railway_station, other)
- batch_status (planned, ready, in_progress, completed, cancelled)
- notes (nullable)
- created_by, updated_by, created_at, updated_at

**Hub-level granularity:** BOM T2 and Mumbai Central are different transport problems even though both are "Mumbai." Batch by hub, not just city.

**Derived fields (do NOT store on batch):** passenger count, assigned vehicle count, remaining unassigned, total capacity. Compute from assignments.

---

### 12. Vehicle Assignments

**What it is:** One vehicle attached to a transport batch, with driver and vendor details.
**Example:** Van-1, Tempo Traveller, capacity 12, vendor ABC Transport, driver Ravi (+919876543210), assigned to BOM T2 morning arrival batch.

**Fields:**
- id
- event_id
- batch_id
- vehicle_label (internal ops name: Van-1, Sedan-2)
- vehicle_type (sedan, suv, van, tempo_traveller, bus, other)
- plate_number (nullable)
- vendor_name (nullable)
- vendor_contact_e164 (nullable)
- driver_name (nullable)
- driver_mobile_e164 (nullable)
- capacity
- scheduled_pickup_at_utc (nullable)
- scheduled_drop_at_utc (nullable)
- assignment_status (assigned, dispatched, completed, cancelled)
- notes (nullable)
- created_by, updated_by, created_at, updated_at

---

### 13. Transport Passenger Assignments

**What it is:** The assignment of a specific person to a specific vehicle within a transport batch.
**Example:** Dr. Sharma assigned to Van-1 in the BOM T2 morning arrival batch, status: assigned.

**Fields:**
- id
- event_id
- batch_id
- vehicle_assignment_id (nullable — until a vehicle is chosen)
- person_id
- travel_record_id
- assignment_status (pending, assigned, boarded, completed, no_show, cancelled)
- pickup_note (nullable)
- drop_note (nullable)
- created_at, updated_at

---

### Transport Management Rules

**Three-tier model:** Batch (operational group) → Vehicle (one vehicle in the batch) → Passenger (person on a vehicle).

**Who manages:** Primary owner is Ops. Also allowed: Super Admin, Event Coordinator. Read-only can view but cannot create, edit, assign, dispatch, or resolve.

**Creation paths:**
1. Auto-generated batches from travel records (suggestions — ops accepts, merges, splits, or discards)
2. Manual batch creation for edge cases (VIP pickup, speaker-only car, late-night arrivals)
3. Board-based drag-and-drop passenger-to-vehicle assignment

**Rules:**
- System can suggest batches, but only humans finalize operational assignments. No auto-assign vehicles in V1.
- Transport is admin-only, no public/delegate access in V1.
- UI designed for Ops speed, not coordinator preferences.

**Transport is the terminal cascade node (business workflow):**
- Travel/accommodation changes can trigger transport review
- Transport changes do NOT trigger another logistics module
- Transport changes CAN trigger: updated ops board counts, notification to traveler if pickup details were sent, export/report changes, audit entries

**Deletion/cancellation policy:**
- No hard deletes. Soft cancel on all three levels.
- Cancelling a batch: passengers move to pending review or reassigned to another batch by Ops
- Cancelling a vehicle: linked passengers become unassigned within the same batch
- Completed records: not editable except by Super Admin via audited correction flow

**Required audit fields on cancel/change:** changed_by, changed_at, change_reason, previous value snapshot or diff.

---

### 14. Notification Templates

**What it is:** A reusable, event-aware communication blueprint for a specific channel and use case, containing approved copy, variable placeholders, branding rules, and delivery metadata, rendered with live data at send time. A governed sendable asset.

**Fields:**
- id
- event_id (nullable — null = global default, set = event-specific override)
- template_key (stable system key: registration_confirmation, faculty_invitation, etc.)
- channel (email, whatsapp)
- template_name (human-readable admin label)
- meta_category (registration, program, logistics, certificates, reminders, system)
- trigger_type (business event this template serves: registration.created, session.updated, travel.saved)
- send_mode (automatic, manual, both)
- status (draft, active, archived)
- version_no
- subject_line (nullable — required for email, null for WhatsApp)
- body_content (template body with {{variable}} placeholders)
- preview_text (nullable — email inbox preview)
- allowed_variables_json
- required_variables_json
- branding_mode (event_branding, global_branding, custom)
- custom_branding_json (nullable — only if branding_mode = custom)
- whatsapp_template_name (nullable — for future WABA mapping)
- whatsapp_language_code (nullable — for future WABA approval)
- notes (nullable)
- is_system_template (prevent deletion of core platform templates)
- last_activated_at (nullable)
- created_by, updated_by, created_at, updated_at, archived_at (nullable)

**Rules:**
- Templates are channel-specific. Email and WhatsApp are separate templates.
- Templates are event-overridable. Global default + event-specific override.
- Override uniqueness: one active template per (event_id, channel, template_key).
- Sent notifications must snapshot rendered content at send time in notification_log. Never rely on template row alone for history.

**10 V1 system template keys (is_system_template = true, each as email + WhatsApp = 20 records):**
1. registration_confirmation
2. faculty_invitation
3. faculty_responsibilities
4. faculty_revised_responsibilities
5. program_update
6. travel_itinerary
7. accommodation_details
8. transport_pickup
9. certificate_ready
10. event_reminder

**System templates are undeletable but overridable per event.**

**Access:** Super Admin and Event Coordinator can create/edit/manage. Ops and Read-only cannot.

---

### 15. Notification Log

**What it is:** The immutable audit record of one delivery attempt for one recipient on one channel for one business trigger, capturing template/version used, rendered payload, provider response, delivery lifecycle, and idempotency context. Proof of send.

**Fields:**
- id
- event_id
- person_id
- template_id (nullable — null only for rare ad hoc/manual messages)
- template_key_snapshot
- template_version_no
- channel (email, whatsapp)
- provider (resend, evolution_api, waba)
- trigger_type (registration.created, travel.saved, program.updated, etc.)
- trigger_entity_type (nullable — registration, travel_record, session, certificate)
- trigger_entity_id (nullable)
- send_mode (automatic, manual)
- idempotency_key (unique)
- recipient_email (nullable)
- recipient_phone_e164 (nullable)
- rendered_subject (nullable)
- rendered_body
- rendered_variables_json (snapshot of actual variable values used)
- attachment_manifest_json (nullable — ticket PDF, hotel PDF, certificate metadata)
- status (queued, sending, sent, delivered, read, failed, retrying)
- attempts (integer)
- last_error_code (nullable)
- last_error_message (nullable)
- last_attempt_at (nullable)
- queued_at
- sent_at (nullable)
- delivered_at (nullable)
- read_at (nullable)
- failed_at (nullable)
- provider_message_id (nullable)
- provider_conversation_id (nullable — for future official WhatsApp providers)
- is_resend (boolean)
- resend_of_id (nullable — links to original log entry)
- initiated_by_user_id (nullable — null for automated sends)
- created_at
- updated_at

**Rules:**
- Append-only in practice. Status updates progress on same row, but never rewrite history or hide failed attempts.
- Raw provider webhook payloads stored in separate notification_delivery_events table, not this row.
- Resend creates a new row with is_resend = true and resend_of_id pointing to original.

**Access:**
- Super Admin: full log for any event, resend any message type
- Event Coordinator: full log for their event, resend registration/faculty/program/logistics/certificate/reminder messages
- Ops: view and resend only logistics-category logs (travel_itinerary, accommodation_details, transport_pickup)
- Read-only: no log access (contains PII). Dashboard counts and "last sent at" indicators only.

**Retry Failed screen:** Super Admin and Event Coordinator full access. Ops only for failed logistics messages.

---

### 16. Automation Triggers

**What it is:** An event-scoped rule that binds a business event to one notification action, defining when the system should automatically send which template, on which channel, to which recipient group, under what conditions.
**Example:** registration.created → if status = confirmed → send registration_confirmation → via email → to the registered person → immediately → once per idempotency key.

**Fields:**
- id
- event_id
- trigger_event_type (registration.created, travel.saved, travel.updated, accommodation.saved, program.updated, certificate.generated)
- guard_condition_json (nullable — e.g., registration.status = confirmed)
- channel (email | whatsapp — singular, not array)
- template_id (must match same channel)
- recipient_resolution (trigger_person, session_faculty, event_faculty, ops_team)
- delay_seconds (0 = immediate)
- idempotency_scope (e.g., per_person_per_trigger_entity_per_channel)
- is_enabled (boolean)
- priority (nullable — send order when multiple triggers fire)
- notes (nullable)
- created_by, updated_by, created_at, updated_at

**Rules:**
- One trigger = one channel = one template. For email + WhatsApp on the same business event, create two trigger rows.
- Trigger execution checks global/event feature flags and notification idempotency before sending.
- Templates decide content. Triggers decide automation behavior. Separately configurable per event.
- Trigger changes must be audited (bad trigger can spam hundreds of people).

**Access:** Super Admin (all events) and Event Coordinator (their event only) can create/edit/enable/disable/test/archive. Ops and Read-only: no access.

---

### 17. Certificate Templates

**What it is:** An event-aware visual document blueprint, stored as editable template JSON plus supporting metadata, defining how a certificate should be rendered for a given type, including layout, branding, dynamic fields, signatures, and verification elements.
**Example:** GEM National 2026 Attendance Certificate — A4 landscape, event logo top-center, "Certificate of Attendance" heading, {{salutation}} {{full_name}} in large text, QR verification code bottom-right.

**Fields:**
- id
- event_id
- template_name
- certificate_type (enum: delegate_attendance, faculty_participation, speaker_recognition, chairperson_recognition, panelist_recognition, moderator_recognition, cme_attendance)
- audience_scope (delegate, faculty, speaker, chairperson, panelist, moderator, mixed)
- template_json (full pdfme designer payload)
- page_size (A4_landscape, A4_portrait)
- orientation (landscape, portrait)
- allowed_variables_json
- required_variables_json
- default_file_name_pattern (e.g., {{full_name}}-{{event_name}}-certificate.pdf)
- preview_thumbnail_url (nullable, R2)
- signature_config_json (nullable — signer name, title, image URL, placement)
- branding_snapshot_json (nullable — logo/header/color assumptions for stable historical rendering)
- qr_verification_enabled (boolean)
- verification_text (nullable — e.g., "Scan to verify authenticity")
- status (draft, active, archived)
- version_no
- is_system_template (boolean)
- notes (nullable)
- created_by, updated_by, created_at, updated_at, archived_at (nullable)

**Rules:**
- One active template per (event_id, certificate_type) — prevents generation mistakes.
- Certificate wording matters politically in medical conferences. Types are not interchangeable.
- Only A4 sizes in V1 (India standard).

**Access:** Super Admin (any event) and Event Coordinator (their event) can create/edit/manage. Ops and Read-only: no access.

---

### 18. Issued Certificates

**What it is:** The immutable record of one certificate generation outcome for one person in one event, including the rendered file, verification identity, eligibility context, and delivery history. A legal/operational issuance record, not just a PDF file.
**Example:** Certificate #GEM2026-ATT-00412 issued to Dr. Priya Patel for attendance at GEM National 2026, PDF in R2, verifiable via QR.

**Fields:**
- id
- event_id
- person_id
- template_id
- template_version_no
- certificate_type
- eligibility_basis_type (registration, attendance, session_assignment, event_role, manual)
- eligibility_basis_id (nullable)
- certificate_number (human-readable unique ID: GEM2026-ATT-00412)
- verification_token (UUID for QR/verify URL)
- storage_key (private R2 object path — NOT a public URL)
- file_name
- file_size_bytes (nullable)
- file_checksum_sha256 (nullable — integrity verification)
- rendered_variables_json
- branding_snapshot_json
- template_snapshot_json (nullable — for forensic reconstruction)
- status (issued, superseded, revoked)
- superseded_by_id (nullable)
- supersedes_id (nullable)
- revoked_at (nullable)
- revoke_reason (nullable)
- issued_at
- issued_by (clerk_user_id)
- last_sent_at (nullable — convenience field; source of truth is notification_log)
- last_downloaded_at (nullable)
- download_count (default 0)
- last_verified_at (nullable)
- verification_count (default 0)
- created_at, updated_at

**Rules:**
- Regeneration creates a new row, supersedes the old one. Never overwrites.
- One current valid certificate per (person_id, event_id, certificate_type) at a time.
- delivered_via and delivered_at belong in notification_log, not on this row.
- Signed URLs generated on demand — no permanent public file URLs.
- Manual issuance requires reason/note and full audit trail.
- Only issuable to people already attached to the event.

**Access:**
- Super Admin: generate, bulk generate, regenerate, resend, revoke, verify (any event)
- Event Coordinator: same capabilities, their event only
- Revoke requires mandatory reason, revoked_at, and actor
- Ops and Read-only: no certificate management

**Bulk generation:** Idempotency-guarded and lock-protected (distributed lock via Upstash Redis). Two admins cannot create duplicate certificate runs for same event/type simultaneously.

---

### 19. Red Flags

**What it is:** A system-generated downstream review alert tied to a specific event record, created when an upstream change means Ops must re-check and possibly re-plan something. Tracked through: unreviewed → reviewed → resolved.
**Example:** Travel updated for Dr. Sharma → accommodation record gets red flag: "Arrival changed from Mar 14 09:10 BOM T2 to Mar 14 13:40 BOM T1", status: unreviewed.

**Fields:**
- id
- event_id
- flag_type (travel_change, travel_cancelled, accommodation_change, accommodation_cancelled, registration_cancelled, shared_room_affected)
- flag_detail (human-readable ops message)
- target_entity_type (accommodation_record, transport_batch, transport_passenger_assignment)
- target_entity_id
- source_entity_type (travel_record, accommodation_record, registration)
- source_entity_id
- source_change_summary_json (nullable — structured machine-readable diff)
- flag_status (unreviewed, reviewed, resolved)
- reviewed_by (nullable — clerk_user_id)
- reviewed_at (nullable)
- resolved_by (nullable — clerk_user_id)
- resolved_at (nullable)
- resolution_note (nullable)
- created_at, updated_at

**Rules:**
- Only one active (unresolved) flag per (event_id, target_entity_type, target_entity_id, flag_type). Prevents spam from repeated edits.
- No severity tiers in V1. Three-state workflow is sufficient.
- Red flags are operational work items, not notification badges.
- Both flag_detail (human-readable) and source_change_summary_json (machine-readable) are stored.

**Access:**
- Super Admin: view, review, resolve all flags across all events
- Event Coordinator: view, review, resolve for their event
- Ops: view, review, resolve for their event (primary working role — UI optimized for them)
- Read-only: can see flag state and detail, but all actions disabled (buttons visible but grayed)

**Every review/resolve action audited with actor, timestamp, and optional resolution note.**

---

### 20. Program Versions

**What it is:** A published, event-scoped snapshot of the scientific program at a specific moment, created when a coordinator releases a new revision, enabling version comparison, diffs, and revised faculty notifications.
**Example:** GEM National 2026, Program Version 3, published March 10: Session "Cardiac Imaging" moved from Hall A to Hall B.

**Fields:**
- id
- event_id
- version_no (sequential per event: 1, 2, 3...)
- base_version_id (nullable — usually the previous published version)
- snapshot_json (full published program state: sessions, sub-sessions, halls, timings, assignments, role-aware TBA slots)
- changes_summary_json (structured diff from previous version)
- changes_description (nullable — coordinator-written release note)
- affected_person_ids_json (people whose responsibilities changed)
- publish_reason (nullable — e.g., faculty availability, hall change, timing correction)
- notification_status (not_required, pending, sent, partially_failed, failed)
- notification_triggered_at (nullable)
- published_by (clerk_user_id)
- published_at
- created_at

**changes_summary_json must contain:**
- added_sessions
- removed_sessions
- moved_sessions (time/date/hall changes)
- assignment_changes (person added, removed, or role changed)
- tba_filled
- tba_reopened

**Rules:**
- Only published versions live here. Draft edits do not create rows.
- Publishing is a deliberate action requiring confirmation — it can trigger notifications and becomes permanent history.

**Access:** Super Admin (any event) and Event Coordinator (their event) can publish. Ops and Read-only cannot.

---

### 21. Audit Log (Bemi + Product Layer)

**What it is:** Automatic database-level change capture via Bemi, enriched with product-layer semantics for operational visibility.

**Bemi provides:**
- Row-level change capture (before/after state)
- Timestamps
- Database-originated audit trail

**Product layer requirements (beyond Bemi):**
- Every auditable record must be event_id-scoped in surfaced history
- Clerk actor context attached on writes. For background jobs: system actor like `system:inngest`
- Business actions need human-readable labels (not just "UPDATE transport_passenger_assignments" but "Moved Dr. Sharma from Van-1 to Sedan-2")
- Soft delete/cancel actions explicit as named business events
- Notification sends/resends audited through notification_log (operational history, not just row mutations)
- High-impact publish actions (program version, trigger enabled, certificate revoked) surface as top-level timeline items
- Sensitive data masked in UI where appropriate (full-fidelity in storage, role-scoped in display)
- Append-only in practice — no admin "edit history" feature
- Cross-module cascades must be reconstructable (travel updated → red flag → transport reassigned → notification resent)

**Surfacing views needed:**
- Person detail: change history tab
- Event-level history
- Module-level history (program, logistics, communications, certificates)

**Access to change history:** Super Admin and Event Coordinator. Ops and Read-only: no person-edit audit visibility by default.

**Retention:** Full history for lifetime of the system. Archive, never discard.

---

## Relationships Between Subjects

### Dependency Chain

**Global (no event required):**
| Subject | Notes |
|---------|-------|
| Person (master people DB) | Identity anchor |
| Global notification templates | event_id = null |

**Event-scoped (requires event_id, no person):**
| Subject | Notes |
|---------|-------|
| Halls | Physical spaces |
| Sessions | Scheduled blocks |
| Session role requirements | Planning slots |
| Program versions | Published snapshots |
| Transport batches | Operational groups |
| Vehicle assignments | Vehicles in batches |
| Certificate templates | Design blueprints |
| Notification templates (overrides) | Event-specific |
| Automation triggers | Send rules |
| Event user assignments | Per-event access |

**Person + Event-scoped (requires both):**
| Subject | Additional Requirements |
|---------|----------------------|
| Registration | Unique (event_id, person_id) |
| Session-faculty assignment | Non-null person_id always |
| Faculty invite | Per person per event |
| Travel record | Optional registration_id |
| Accommodation record | Optional registration_id |
| Transport passenger assignment | Requires travel_record_id + batch_id |
| Issued certificate | Requires eligibility_basis |
| Notification log | Per send attempt |
| Red flags | Target an event-scoped record |

### Cascade Rules

| Source Change | Downstream Effect |
|--------------|-------------------|
| Travel updated | → Red flag on accommodation + transport recalculation + delegate notification |
| Travel cancelled | → High-severity red flag on accommodation + transport + delegate notification |
| Accommodation updated | → Red flag on transport + delegate notification |
| Accommodation cancelled | → Red flag on transport + delegate notification |
| Shared room change | → All occupants in shared_room_group flagged |
| Registration cancelled | → Red flag on travel, accommodation, transport (no auto-delete) |
| Session cancelled | → Notification to all assigned faculty (assignments stay intact) |
| Program published | → Revised responsibility notifications to affected faculty |
| Transport changed | → Terminal node: updated board counts, notification if details already sent, audit |

**Cascade direction:** Travel → accommodation + transport. Accommodation → transport. Transport → nothing (terminal in business workflow, can still trigger system effects).
**No upstream cascades.** Accommodation never affects travel. Transport never affects accommodation or travel.

### Key Referential Rules

| Rule | Details |
|------|---------|
| Person archive | All connected records stay intact. Real name preserved in historical views. |
| Person anonymize | Name → "Anonymized", email/mobile hashed. Row persists. Super Admin only. |
| Event archive/cancel | All linked data stays intact. Read-only by state rules. |
| Registration without person | Never allowed. person_id is non-null. |
| Assignment without person | Never allowed. person_id is non-null on assignments. |
| Logistics without registration | Allowed. Faculty/VIPs may have travel/accommodation without delegate registration. |
| Logistics without event participation | Not allowed. Person must belong to event in some capacity. |
| Certificate without registration | Allowed via eligibility_basis_type = event_role or manual. |
| Certificate without event participation | Not allowed. Person must be attached to event. |
| Hard delete of any record | Never in normal operations. Only via compliance process with legal sign-off. |

---

## Future-Proofing Decisions

| Decision | Answer | V1 Action |
|----------|--------|-----------|
| **Teams/organizations** | Yes, likely later. Multiple medical associations on same platform. | Add organization_id to events. Let Clerk handle org membership. No org-switching UI in V1. |
| **Real-time collaboration** | No in V1. Optimistic locking with conflict warnings instead. | Implement updated_at-based collision detection. Publish-based program flow. |
| **Admin panel** | Already built — the entire app is an admin panel for conference operations. | N/A |
| **Operational analytics** | Yes, V1 needs event execution metrics, delivery rates, coverage gaps, exportable reports. | Build dashboards and exports. No product telemetry or behavioral analytics. |
| **Institutional sales** | Yes, likely later. Medical associations, hospitals, CME bodies. | Model ownership boundary via organization. Don't build self-serve onboarding or billing. |
| **Data compliance (GDPR-like)** | Yes, plan for it now. Indian medical data has PII implications. | No hard deletes, signed URLs, anonymization over destruction, Mumbai-first hosting, audit survives anonymization. No compliance UI in V1. |
| **Public API** | Yes, probably later. Event websites, hospital systems, BI integrations. | Design clean internal services with stable IDs. No API keys, developer portal, or external write access in V1. |
| **Export/import** | V1 needs rich exports. Excel/XLSX, PDF, ZIP, event archive bundles. Imports: CSV/XLSX for people and program. | Build export jobs and file manifests. No JSON/XML/API bulk import. |

---

## Users / Authentication

**Users are NOT stored in our database.** Clerk owns authentication, sessions, and role assignments.

- Our database stores only `clerk_user_id` as a reference where needed (audit log, created_by, reviewed_by, etc.)
- For background jobs, use system actor like `system:inngest`
- Four global roles managed in Clerk: super_admin, event_coordinator, ops, read_only
- Per-event access managed in our event_user_assignments table

---

## Role Permissions Summary

| Capability | Super Admin | Event Coordinator | Ops | Read-only |
|-----------|-------------|-------------------|-----|-----------|
| Create events | Yes (all) | Yes | No | No |
| Edit events | Yes (all) | Yes (own/assigned) | No | No |
| Archive/cancel events | Yes | No | No | No |
| Create people | Yes | Yes | No | No |
| Archive/anonymize people | Yes | No | No | No |
| Create sessions | Yes | Yes (own event) | No | No |
| Manage faculty assignments | Yes | Yes (own event) | View only | View only |
| Create registrations | Yes | Yes (own event) | No | No |
| Manage travel/accommodation | Yes | Yes (own event) | Yes (assigned) | No |
| Manage transport | Yes | Yes (own event) | Yes (primary) | View only |
| Manage red flags | Yes (all) | Yes (own event) | Yes (own event) | View only (disabled actions) |
| Publish program versions | Yes (all) | Yes (own event) | No | No |
| Manage notification templates | Yes (all) | Yes (own event) | No | No |
| Manage automation triggers | Yes (all) | Yes (own event) | No | No |
| View notification log | Yes (all) | Yes (own event) | Logistics only | No |
| Resend notifications | Yes (all) | Yes (own event) | Logistics only | No |
| Generate certificates | Yes (all) | Yes (own event) | No | No |
| Revoke certificates | Yes (all) | Yes (own event, with reason) | No | No |
| View person change history | Yes | Yes | No | No |

---

## Open Questions

- [ ] Should session_role_requirements be a separate table or JSONB on the session record?
- [ ] Exact auto-archive timing for completed → archived (90 days confirmed, or configurable per event?)
- [ ] Should event duplication copy automation triggers and their enabled/disabled states?
- [ ] Notification delivery events table structure for raw provider webhook payloads
- [ ] Exact idempotency_key composition formula for each trigger type
- [ ] Whether V1 needs a formal event_people junction table or if participation is implied by existing junctions (registrations + session_faculty)
- [ ] Shared room group upgrade path to full room-assignment model — when and what triggers the migration
- [ ] CME attendance certificate: separate type or handled via delegate_attendance with CME fields?
- [ ] Exact retention policy for notification_log rows (keep forever or archive after N years?)
- [ ] Organization table structure for future multi-tenancy (minimal fields to add now)
