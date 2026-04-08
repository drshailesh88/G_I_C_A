
Should session_role_requirements be a separate table or JSONB on the session record?


• Separate table. I would not use JSONB here.

  Use session_role_requirements as its own event-scoped table because this is not loose config, it is operational planning data that you will query constantly.

  Why separate table is correct:

  - You need reliable counts like Speakers 2/3 assigned, Moderator 0/1
  - You need filtering/reporting on incomplete role coverage
  - You need clean diffs in program versioning
  - You may later add role-specific notes or ordering rules
  - JSONB makes validation, querying, and change tracking messier for no real benefit

  Canonical shape:

  - id
  - event_id
  - session_id
  - role
  - required_count
  - created_at
  - updated_at

  Constraint:

  - unique on (session_id, role)

  So:

  - session_role_requirements = structured planning demand
  - session_assignments = actual person assignments

  That split is the right architecture.

  question 2 : Exact auto-archive timing for completed → archived (90 days confirmed, or configurable per event?)


• Lock it as fixed 90 days after event end, not configurable per event in V1.

  Exact rule:

  - Event moves published -> completed automatically on end_date + 1 day
  - Event becomes eligible for auto-archive 90 days after end_date
  - A daily background job archives eligible completed events
  - Super Admin can archive earlier manually
  - Event Coordinator cannot change the retention window

  Why I’m choosing this:

  - per-event configurability adds admin complexity with very little value
  - 90 days is enough for post-event corrections, certificate reissues, attendance fixes, and reporting
  - a fixed rule is easier to explain to the client and safer operationally

  So the V1 answer is:

  - 90 days confirmed
  - global rule
  - manual early archive allowed for Super Admin
  - not per-event configurable in V1

  question 3 Should event duplication copy automation triggers and their enabled/disabled states?
  es, but with one safeguard.

  Lock it as:

  - Event duplication does copy automation triggers
  - It also copies their is_enabled state
  - But copied triggers are inactive in practice until the new event is reviewed and published

  The safest V1 implementation is:

  - Copy trigger rows as-is, including:
      - trigger_event_type
      - guard_condition_json
      - channel
      - template binding
      - recipient_resolution
      - delay_seconds
      - priority
      - is_enabled
  - On the duplicated event, automation execution is still blocked unless:
      - the event is in a live/published state
      - the relevant module/communication feature flags are enabled
      - required templates/providers exist for that event

  Why this is the right choice:

  - admins usually duplicate an event precisely because they want to reuse communications setup
  - forcing them to rebuild triggers every year is bad ops UX
  - forcing all copied triggers to disabled adds unnecessary checklist work
  - but allowing draft events to fire automations would be dangerous

  So the rule is:

  - copy them
  - preserve enabled/disabled state
  - execution remains gated by event status and feature readiness

  That gives reuse without accidental spam.

  question 4- Notification delivery events table structure for raw provider webhook payloads


• Lock it as a separate append-only forensic table. Do not overload notification_log with raw webhook junk.

  notification_delivery_events

  - id
  - event_id
  - notification_log_id
  - channel = email | whatsapp
  - provider = resend | evolution_api | waba
  - provider_message_id nullable
  - provider_conversation_id nullable
  - webhook_event_type
    Examples: queued, sent, delivered, read, failed, bounced
  - webhook_event_at nullable
    Provider-reported event timestamp
  - received_at
    When our system received the webhook
  - normalized_status nullable
    queued | sending | sent | delivered | read | failed
  - raw_payload_json
    Full provider payload
  - headers_json nullable
    Useful for signature/debugging
  - signature_valid nullable
  - dedupe_key
    Unique per provider event/callback
  - processing_status
    pending | processed | ignored | failed
  - processing_error nullable
  - created_at

  Rules

  - Append-only
  - One row per webhook callback/event
  - notification_log is the operational truth; this table is forensic trace
  - Webhook processing updates notification_log, but never deletes or rewrites the raw event row
  - Unique constraint on dedupe_key to survive duplicate callbacks

  Indexes

  - (notification_log_id)
  - (event_id, provider)
  - (provider, provider_message_id)
  - unique (dedupe_key)

  That is the right V1 structure.

  question 5 Exact idempotency_key composition formula for each trigger type


• Yes. Lock one canonical pattern and then bind each trigger type to its entity.

  ## Canonical automatic-send formula

  For any automation-triggered notification, use:

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{recipientPersonId}:{triggerType}:{triggerEntityType}:{triggerEntityId}:{sourceEventId}

  Where:

  - eventId = active event
  - automationTriggerId = the exact trigger row that fired
  - channel = email or whatsapp
  - templateKey = snapshot key like registration_confirmation
  - recipientPersonId = person receiving the message
  - triggerType = business event like registration.created
  - triggerEntityType = canonical source entity type
  - triggerEntityId = source row ID
  - sourceEventId = emitted Inngest/domain-event ID

  That is the right formula because it:

  - dedupes retries safely
  - allows multiple trigger rows for the same business event
  - allows multiple future updates on the same record
  - stays stable across provider retries

  ## Exact binding by trigger type

  - registration.created

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:registration.created:registration:{registrationId}:{sourceEventId}

  - registration.cancelled

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:registration.cancelled:registration:{registrationId}:{sourceEventId}

  - faculty.invitation

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:faculty.invitation:faculty_invite:{facultyInviteId}:{sourceEventId}

  - travel.saved

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:travel.saved:travel_record:{travelRecordId}:{sourceEventId}

  - travel.updated

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:travel.updated:travel_record:{travelRecordId}:{sourceEventId}

  - travel.cancelled

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:travel.cancelled:travel_record:{travelRecordId}:{sourceEventId}

  - accommodation.saved

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:accommodation.saved:accommodation_record:{accommodationRecordId}:{sourceEventId}

  - accommodation.updated

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:accommodation.updated:accommodation_record:{accommodationRecordId}:{sourceEventId}

  - accommodation.cancelled

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:accommodation.cancelled:accommodation_record:{accommodationRecordId}:{sourceEventId}

  - session.cancelled

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:session.cancelled:session:{sessionId}:{sourceEventId}

  - program.version_published

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:program.version_published:program_version:{programVersionId}:{sourceEventId}

  - certificate.generated

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:certificate.generated:issued_certificate:{issuedCertificateId}:{sourceEventId}

  - transport.updated

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:transport.updated:transport_passenger_assignment:{transportPassengerAssignmentId}:{sourceEventId}

  If the transport update is batch-level and not passenger-specific, use:

  auto:{eventId}:{automationTriggerId}:{channel}:{templateKey}:{personId}:transport.updated:transport_batch:{batchId}:{sourceEventId}

  ## Manual resend formula

  Manual resend must not reuse the automatic key. Use:

  manual-resend:{eventId}:{originalNotificationLogId}:{initiatedByUserId}:{channel}:{requestId}

  ## Hard rule

  Do not compose idempotency keys from updated_at timestamps or rendered content hashes. Use the emitted domain-event ID. That is the cleanest and safest V1 

  question 6 - Whether V1 needs a formal event_people junction table or if participation is implied by existing junctions
  V1 needs a formal event_people junction table. Do not leave participation implied.

  Lock this decision:

  - people = global master identity
  - event_people = explicit membership of a person in an event
  - other tables like registration, faculty invite, session assignment, travel, accommodation, and certificates hang off that event attachment, not the other way around

  Why implied participation is the wrong model:

  - logistics can exist without registration
  - certificates can exist via event_role or manual
  - faculty can be invited before a confirmed registration exists
  - people pickers, counts, filters, and event rosters need one clean source of truth
  - “who belongs to this event?” becomes ugly and error-prone if you derive it from five different tables

  What event_people should do in V1:

  - establish that the person belongs to the event
  - store high-level participation type:
    delegate | faculty | both | guest | sponsor | volunteer
  - support active/inactive/archived participation state
  - become the guardrail for “logistics without event participation is not allowed”

  Canonical minimal shape:

  - id
  - event_id
  - person_id
  - participant_type
  - status
    active | inactive | archived
  - source
    registration | faculty_invite | manual | import
  - created_at
  - updated_at

  Constraint:

  - unique on (event_id, person_id)

  Rule:

  - registration, faculty invite acceptance, manual add, or CSV import can create/upsert event_people
  - travel/accommodation/transport/certificate issuance should require an existing event_people row

  So the answer is:

  - Yes, formal event_people is needed in V1
  - No, participation should not be only implied by downstream records

  question 7 Shared room group upgrade path to full room-assignment model — when and what triggers the migration
  o not upgrade in V1. Keep shared_room_group for now and define explicit triggers for when it becomes insufficient.

  Lock this decision:

  - V1 uses shared_room_group on accommodation_records
  - Full room-assignment model is a V2 migration, not current scope

  ## What triggers the migration

  Upgrade only when one or more of these become real requirements:

  1. Hotel inventory management

  - You need to track room stock by hotel, room type, occupancy, and availability
  - Example: “How many twin rooms are still free at Hotel Taj?”

  2. Room-first assignment instead of person-first assignment

  - Ops starts assigning rooms as inventory objects, then placing people into them
  - Not just typing Room 412 onto a person record

  3. Variable occupancy rules

  - Different hotels or room types have different max occupancy
  - Example: some rooms allow 2, some 3, some family/VIP exceptions

  4. Gender / pairing / roommate constraints

  - Need rules like same-gender rooming, faculty-only pairing, VIP isolation, or “do not room together”

  5. Multi-occupant room exports and room-level views

  - Need a clean “show me everyone in Room 412” model without inferring through a shared string key

  6. Check-in / room change workflows become operationally complex

  - Late room moves, partial occupancy, hotel-side corrections, stay extensions, split stays

  7. Multiple stays per person in one event

  - Example: hotel change mid-event or pre-conference/post-conference split accommodation

  ## What the V2 model becomes

  When migration is triggered, move to:

  - hotels
  - hotel_rooms
  - room_assignments

  Likely shape:

  - hotels: event-scoped hotel master
  - hotel_rooms: room inventory per hotel
  - room_assignments: person-to-room stay rows with check-in/out

  ## Migration threshold

  My PM recommendation:

  - stay on shared_room_group unless you hit either
      - 3+ hotels with real room inventory tracking
      - repeated operational errors caused by shared-string grouping
      - explicit client demand for room-level allocation board/export

  ## Practical rule

  If the accommodation team is still thinking in:

  - “assign a hotel and maybe a room number to a person”

  then shared_room_group is enough.

  If they start thinking in:

  - “manage room inventory and place people into rooms”

  then you must migrate.

  So the answer is:

  - not now
  - migrate only when accommodation becomes inventory-driven, not person-record-driven

  question 8 CME attendance certificate: separate type or handled via delegate_attendance with CME fields?
  Separate type. Lock cme_attendance as its own certificate type.

  Do not hide CME inside delegate_attendance with extra fields. That looks simpler now, but it creates ambiguity later around:

  - certificate wording
  - credit hours
  - accrediting body text
  - eligibility rules
  - verification meaning

  Use this rule:

  - delegate_attendance = generic attendance certificate
  - cme_attendance = attendance certificate with CME-specific wording and fields

  Why this is the right call:

  - in medical conferences, CME wording is not just decorative
  - some events will need standard attendance only
  - some will need a CME-compliant certificate with credit metadata
  - keeping them separate avoids ugly conditional template logic and accidental wrong issuance

  V1 implementation note:

  - cme_attendance can reuse most of the same variables as delegate_attendance
  - add CME-only variables when needed:
      - cme_credit_hours
      - accrediting_body_name
      - accreditation_code
      - cme_claim_text

  So the decision is:

  - separate type
  - shared template mechanics
  - different certificate semantics

  question 9 Exact retention policy for notification_log rows (keep forever or archive after N years?)
  Lock this as:

  - notification_log rows are retained indefinitely
  - No automatic deletion
  - No time-based purge in V1

  Why:

  - they are proof-of-send records
  - they matter for client trust, audit, certificate delivery history, and dispute resolution
  - the volume is manageable for this product in V1

  Operational policy:

  - keep notification_log in the primary database
  - if size/performance becomes an issue later, move older rows to cold archive after 3 years, but still retain them
  - that is an implementation optimization, not a change in retention policy

  Important distinction:

  - notification_log = keep forever
  - notification_delivery_events raw webhook payloads = can be archived sooner later if needed, because they are forensic detail, not the main operational record

  So the exact V1 answer is:

  - keep forever
  - no purge
  - optional cold archival later, but not deletion

  question 10-Organization table structure for future multi-tenancy (minimal fields to add now)
  Add it now, but keep it minimal.

  ## organizations

  - id
  - slug
  - name
  - status
    active | inactive
  - clerk_org_id nullable
    Only if you want a clean bridge to Clerk orgs later
  - primary_contact_name nullable
  - primary_contact_email nullable
  - primary_contact_phone_e164 nullable
  - branding_defaults_json nullable
    Keep minimal: default logo/header/colors/from-name if you want org-level defaults later
  - created_at
  - updated_at

  ## Rules

  - events.organization_id should be non-null in the schema, even if V1 has only one org row
  - unique on slug
  - no billing fields now
  - no address/legal/GST fields now
  - no self-serve onboarding fields now

  ## Why this shape

  This gives you enough for:

  - future institutional ownership
  - org-level branding defaults
  - Clerk mapping
  - clean event ownership boundary

  Without dragging in premature SaaS complexity.

  So the V1 answer is: small ownership table, not a full enterprise account model.