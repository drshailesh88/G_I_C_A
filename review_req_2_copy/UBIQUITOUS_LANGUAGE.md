# Ubiquitous Language — GEM India

> Canonical domain glossary for the GEM India conference management platform.
> All code, UI labels, API names, and documentation must use these terms exactly.
> Date: 2026-04-07

---

## People & Identity

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Person** | A single human identity in the master database, reusable across events — the global anchor for all event participation. | Contact, delegate (when used as an identity), user, member, attendee, participant |
| **Salutation** | The honorific prefix stored separately from the name (Dr, Prof, Mr, Mrs, Ms, Mx). | Title, prefix, honorific |
| **Full Name** | A single text field holding the person's complete name, without first/last split. | First name, last name, given name, surname |
| **Tags** | An array of categorization labels on a person record used for filtering and campaign exports (VIP, sponsor, volunteer). | Categories, labels, segments, groups |
| **Deduplication** | The process of detecting and merging duplicate person records, matched on email OR mobile (E.164). | Dedup, merge, reconciliation |
| **Merge** | The admin-reviewed action of combining two person records into one, preserving the richer data and audit trail. | Deduplicate, consolidate, combine |
| **Anonymize** | The irreversible replacement of a person's PII with hashed placeholders while preserving the row for referential integrity. Super Admin only. | Delete, purge, GDPR delete, erase |
| **Admin User** | A Clerk-managed authentication identity with a global role — NOT stored in our database. Referenced only as `clerk_user_id`. | User, staff, team member, operator |
| **Role (global)** | One of four Clerk-managed access levels: Super Admin, Event Coordinator, Ops, Read-only. | Permission level, access tier, user type |

---

## Events & Venue

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Event** | A single conference instance that acts as the primary data boundary — owns its program, registrations, logistics, certificates, and communications. | Conference, meeting, gathering, symposium (when referring to the top-level entity) |
| **Event Workspace** | The central hub screen (M21) from which all event-specific modules are accessed. | Event dashboard, event home, event detail |
| **Hall** | A named physical space within an event venue where sessions take place. Stored in a dedicated table to prevent typo duplicates. | Room, auditorium, venue (when referring to a specific space), track room |
| **Module Toggle** | A per-event boolean flag enabling or disabling a feature area (sessions, registration, travel, accommodation, transport, certificates, QR attendance). | Feature flag (reserve for infrastructure-level toggles), capability switch |
| **Event Status** | One of five lifecycle states: draft, published, completed, archived, cancelled. | Phase, stage, state (acceptable in code, avoid in UI/docs) |
| **Publish** | The explicit action transitioning an event from draft to published, making it visible and operational. | Launch, activate, go live |
| **Archive** | The action transitioning a completed event to read-only state, preserving all data for reports and certificate verification. | Close, end, deactivate, retire |
| **Duplicate Event** | The action of cloning an event's structure (sessions, halls, toggles, branding, triggers) into a new draft event without copying any person-linked data. | Copy, clone, template from |

---

## Scientific Program

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Session** | A scheduled time block within an event, occupying a specific hall — can be scientific (keynote, panel, symposium) or service (break, lunch, registration). | Talk, presentation, slot, block, contribution, time slot |
| **Sub-session** | A child session nested one level under a parent session (e.g., individual talks within a symposium). No grandchildren allowed. | Nested session, child session, contribution |
| **Session Type** | The classification of a session: keynote, panel, workshop, free_paper, plenary, symposium, break, lunch, registration, other. | Format, category, kind |
| **Track** | A thematic grouping of sessions (e.g., "Cardiology", "Orthopedics"). Stored as nullable text on the session, not a separate entity. | Topic, theme, stream, strand |
| **Role Requirement** | A planning record on a session defining how many people of a specific role are needed (e.g., "needs 1 Chair, 3 Speakers"). Has no person_id. | Slot, TBA slot, placeholder, vacancy, demand |
| **Assignment** | A confirmed link between a person and a session with a defined responsibility role. Always has a non-null person_id. | Faculty assignment, session assignment, responsibility, slot filling |
| **Responsibility Role** | The function a person performs in a session: speaker, chair, co_chair, moderator, panelist, discussant, presenter. | Faculty role, session role, assignment type |
| **Faculty** | A person who holds any responsibility role in any session of an event. Not a permanent identity — a person is "faculty" only in the context of their event assignments. | Speaker (when used generically), expert, resource person, panelist (when used generically) |
| **Faculty Invite** | A separate workflow record tracking the invitation and confirmation status for a faculty member's responsibility bundle in an event. | Invitation, confirmation request, RSVP |
| **Responsibility Bundle** | The complete set of a person's assignments across all sessions in one event, sent as one aggregated communication. | All responsibilities, session list, assignment list |
| **Program Version** | A published snapshot of the scientific program at a specific moment, enabling version comparison, diffs, and revised faculty notifications. | Revision, release, schedule version, timetable version |
| **Revised Responsibilities** | A notification sent to affected faculty when the program changes, showing what was Added, changed (Before/After), and Cancelled (A/B/C format). | Update notification, change notification, program update |
| **Conflict** | An overlap detected by the system: either a person assigned to two sessions at the same time (faculty conflict) or two sessions in the same hall at the same time (hall conflict). Warnings, not hard blocks. | Clash, collision, scheduling error, double-booking |

---

## Registration

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Registration** | A per-event record linking a person to a specific event as a participant, with event-specific details like category, age, preferences, and QR token. | Sign-up, enrollment, ticket, booking, RSVP |
| **Registration Number** | An auto-generated unique identifier for a registration, used in certificates and self-serve verification. | Ticket number, confirmation number, booking ID |
| **Category** | The participation classification of a registrant: delegate, faculty, invited_guest, sponsor, volunteer. NOT a ticket tier. | Ticket type, registration type, participant type (acceptable in event_people only) |
| **Delegate** | A person registered to attend an event as an audience member or general participant. One specific category value. | Attendee, participant (when referring to a registered delegate specifically) |
| **Preference** | Optional logistics information captured at registration time (travel date/time, dietary needs, accessibility requirements). Stored as JSONB. | Survey response, custom field answer, registration extra |
| **QR Token** | A unique string assigned to a registration, encoded into a QR code for check-in scanning. | QR code (the code is the visual representation; the token is the data), ticket code |
| **Registration Status** | One of five states: pending, confirmed, waitlisted, declined, cancelled. Check-in is NOT a registration status. | State, stage |

---

## Logistics: Travel

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Travel Record** | An event-scoped logistics record for one person's confirmed journey segment — one leg of their trip. | Itinerary (an itinerary is the collection of all travel records for a person), flight record, booking, journey |
| **Direction** | Whether a travel segment is inbound (arriving to event city), outbound (departing), intercity, or other. | Type, kind, leg type |
| **PNR** | The booking reference code for a travel segment (Passenger Name Record for flights, PNR for trains). | Booking reference, confirmation code, reservation ID |
| **Attachment** | A PDF/image file (e-ticket, boarding pass) uploaded to R2 and linked to a travel or accommodation record. | Document, file, upload, ticket (ambiguous — ticket also means registration in some systems) |

---

## Logistics: Accommodation

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Accommodation Record** | A per-person, per-event record capturing where someone stays during the conference. | Hotel booking, room assignment (implies inventory management we don't have in V1), lodging, stay |
| **Rooming List** | An export of accommodation records grouped by hotel, formatted for hotel front desk use. | Hotel report, room report, accommodation export |
| **Shared Room Group** | A string key linking accommodation records of people sharing the same room. V1 approach — not a room inventory model. | Room assignment group, roommate link |

---

## Logistics: Transport

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Transport Batch** | An operational grouping of people with similar movement needs, defined by date, movement type, time window, and pickup/drop hub. | Shuttle batch, arrival batch, transfer group, run |
| **Hub** | The specific operational pickup or drop-off point (e.g., "BOM T2", "Mumbai Central", "Hotel Leela Lobby"). More granular than city. | Location, point, station, terminal (terminal is a field within hub) |
| **Vehicle Assignment** | One vehicle attached to a transport batch, with driver and vendor details. | Vehicle allocation, car assignment, shuttle assignment |
| **Passenger Assignment** | The link between a specific person and a specific vehicle within a transport batch. | Rider, passenger, seat assignment |
| **Movement Type** | Whether a transport batch handles arrivals or departures. | Direction (already used in travel), batch type |

---

## Communications

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Notification** | A single outbound message sent to one person on one channel (email or WhatsApp) for one business trigger. | Message, communication, alert, email (when used generically for any notification) |
| **Notification Template** | A reusable, event-aware communication blueprint for a specific channel and use case, with variable placeholders and branding rules. | Email template, message template, template (too generic) |
| **Template Key** | A stable system identifier for a template's purpose (e.g., `registration_confirmation`, `faculty_invitation`, `travel_itinerary`). | Template name (the human-readable label), template ID (the UUID) |
| **Channel** | The delivery medium: email or whatsapp. Always singular per notification. | Medium, provider (provider is the service that delivers, not the channel) |
| **Provider** | The external service that delivers notifications: Resend (email), Evolution API (WhatsApp), or future WABA. | Channel (channel is the medium, provider is the service), gateway, API |
| **Automation Trigger** | An event-scoped rule binding a business event to one notification action — one trigger, one channel, one template. | Rule, workflow, automation, trigger (acceptable shorthand in code) |
| **Notification Log** | The immutable audit record of one delivery attempt — proof of send with rendered content, provider response, and delivery lifecycle. | Send log, delivery log, message history, audit log (audit log is the Bemi system) |
| **Delivery Event** | A raw provider webhook payload stored in the forensic `notification_delivery_events` table. | Webhook, callback, status update (too vague) |
| **Idempotency Key** | A unique string preventing duplicate notification sends, composed from event + trigger + recipient + entity + channel. | Dedup key, unique key |
| **Resend (action)** | The manual action of creating a new notification log entry for a previously sent message. Creates a new row, never reuses the old one. | Retry (retry is automatic from failed state; resend is manual and deliberate) |

---

## Certificates

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Certificate Template** | A pdfme-based visual document blueprint stored as JSON, defining layout, branding, dynamic fields, and signatures for a certificate type. | Design, layout, format |
| **Certificate Type** | The classification: delegate_attendance, faculty_participation, speaker_recognition, chairperson_recognition, panelist_recognition, moderator_recognition, cme_attendance. | Category, kind |
| **Issued Certificate** | An immutable issuance record for one person, one event, one type — includes the rendered PDF file reference, verification token, and supersession chain. | Generated certificate, certificate (acceptable shorthand), PDF |
| **Certificate Number** | A human-readable unique identifier (e.g., GEM2026-ATT-00412) used in verification. | Certificate ID (the UUID), serial number |
| **Verification Token** | A UUID encoded in the certificate QR code, used for public verification without exposing internal IDs. | QR token (QR token is for check-in; verification token is for certificates) |
| **Supersede** | The action of replacing an issued certificate with a regenerated version. The old certificate transitions to `superseded` status. Never overwrite. | Replace, regenerate (regenerate is the action that causes supersession), update |
| **Revoke** | The compliance action of invalidating an issued certificate with a mandatory reason. Irreversible. | Cancel, delete, void |
| **Storage Key** | The private R2 object path for a certificate PDF. Never exposed directly — access via signed URLs only. | File URL, PDF URL, download link |
| **Signed URL** | A time-limited, access-controlled URL generated on demand for private file access (certificates, ticket attachments). | Public URL, permanent URL, direct link |

---

## QR & Attendance

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Attendance Record** | A physical presence record created by QR scan or manual check-in. Separate from registration status. Repeatable per day/session. | Check-in (acceptable verb form), scan, registration status |
| **Check-in** | The act of recording a person's physical arrival, via QR scan or manual entry. Does NOT change registration status. | Register (registration is the enrollment action), sign in |
| **Scanner** | The lightweight PWA used by crew on phones/iPads to scan QR codes at event entry points. | QR reader, check-in app, scanning app |

---

## System & Cross-Cutting

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Red Flag** | A system-generated downstream review alert created when an upstream change requires ops to re-check and possibly re-plan something. Three states: unreviewed → reviewed → resolved. | Alert, warning, notification (notification is for outbound comms), change indicator, issue |
| **Cascade** | The automatic downstream side effects triggered when a record changes — e.g., travel update creates red flags on accommodation and triggers transport recalculation. | Side effect, propagation, chain reaction, ripple |
| **Domain Event** | A canonical named event emitted via Inngest when a business action occurs (e.g., `conference/travel.updated`). Triggers cascade consumers. | Inngest event, background event, trigger event |
| **Event Isolation** | The mandatory rule that every event-scoped query, mutation, export, and job must filter by `event_id`. The primary data boundary. | Multi-tenancy (we use single-tenant with event scoping, not true multi-tenancy), data scoping, event context |
| **Event People** | The auto-upserted junction table establishing that a person belongs to an event. Never manually created — system creates it on first event touchpoint. | Event membership, participation record, event roster entry |
| **Participant Type** | The coarse classification on event_people: delegate, faculty, both, guest, sponsor, volunteer. | Role (role is the Clerk global role or the responsibility role in sessions), category (category is on registration) |
| **Audit Log** | Automatic database-level change capture via Bemi (before/after state, timestamps). NOT the notification log. | Change log, history, activity log (acceptable for UI label) |
| **Soft Delete** | Setting a `deleted_at` or status to cancelled/archived — the record stays for referential integrity and audit. No hard deletes in normal operations. | Delete, remove, purge |
| **Feature Flag** | An Upstash Redis key gating infrastructure-level capabilities (WhatsApp enabled, email provider, certificate self-serve, registration open). | Module toggle (module toggles are per-event on the event record; feature flags are system-wide in Redis) |

---

## Relationships

- A **Person** can belong to multiple **Events** simultaneously via **Event People** records.
- A **Person** participates in an **Event** as a **Delegate** (via **Registration**) or as **Faculty** (via **Assignments**) or both.
- An **Event** contains **Halls**, **Sessions**, and optionally **Registrations**, **Travel Records**, **Accommodation Records**, **Transport Batches**, and **Certificates**.
- A **Session** belongs to one **Hall** and one **Event**. A **Session** can have **Sub-sessions** (one level only).
- A **Session** has **Role Requirements** (planning demand) and **Assignments** (confirmed people). These are separate tables.
- A **Faculty Invite** covers the entire **Responsibility Bundle** for one person in one event — not per-session.
- A **Travel Record** is one journey segment. A person may have multiple **Travel Records** per event (inbound + outbound).
- An **Accommodation Record** may link to a **Shared Room Group** for co-occupants.
- A **Transport Batch** contains **Vehicle Assignments**, which contain **Passenger Assignments**.
- A **Notification** is sent via one **Channel** using one **Provider**, rendered from one **Notification Template**.
- An **Automation Trigger** binds one **Domain Event** to one **Channel** + one **Template**. Two triggers needed for email + WhatsApp.
- An **Issued Certificate** may be **Superseded** by a newer version. Only one `issued` certificate exists per (person, event, type).
- **Red Flags** point from a source change (e.g., travel record) to a target record (e.g., accommodation record) within the same event.
- **Cascade direction** is strictly one-way: Travel → Accommodation + Transport. Accommodation → Transport. Transport → nothing.

---

## Example Dialogue

> **Dev:** "When a coordinator updates a **Travel Record** for Dr. Sharma, what happens?"
>
> **Domain Expert:** "The system emits a `conference/travel.updated` **Domain Event**. Three **Cascade** consumers fire: one creates a **Red Flag** on Dr. Sharma's **Accommodation Record**, one triggers **Transport Batch** recalculation, and one sends a **Notification** to Dr. Sharma on whatever **Channels** the **Automation Triggers** are configured for."
>
> **Dev:** "Does the **Red Flag** auto-fix the accommodation?"
>
> **Domain Expert:** "No. A **Red Flag** is a review alert, not an auto-correction. It shows up as 'unreviewed' on the accommodation list. **Ops** sees the flag detail — 'Flight changed: DEL→BOM, Jan 15→Jan 17' — and decides whether the hotel dates need changing. They mark it 'reviewed' when they've seen it, then 'resolved' when the accommodation is fixed."
>
> **Dev:** "What if the coordinator also wants to resend the travel itinerary?"
>
> **Domain Expert:** "That's a manual **Resend**, not a retry. It creates a new **Notification Log** entry with `is_resend = true`. The original log row stays untouched — it's proof that the first send happened. The **Idempotency Key** for the resend is different from the original because it includes the initiating user and a request ID."
>
> **Dev:** "And if Dr. Sharma's **Registration** is cancelled — do the **Travel Records** get deleted?"
>
> **Domain Expert:** "Never. **Registration** cancellation creates **Red Flags** on all linked logistics records for ops review. No auto-delete, no auto-cancel. The travel, accommodation, and transport records stay intact. **Ops** reviews the flags and decides what to do. That's the whole point of the **Red Flag** system — human judgment, not cascading destruction."

---

## Flagged Ambiguities

1. **"User" vs "Person"** — The owner's PDF uses "user" to mean both admin staff and delegates. In our system: an **Admin User** is a Clerk identity with a global role. A **Person** is a master database record. They are never the same entity. A person does not need a Clerk account. An admin user does not need a person record (though they may have one).

2. **"Role"** — Used in three different contexts. **Global Role** (Super Admin, Event Coordinator, Ops, Read-only) is Clerk-managed access. **Responsibility Role** (speaker, chair, moderator, panelist) is a per-session function. **Participant Type** (delegate, faculty, guest) is event-level classification. Never use "role" without qualifying which kind.

3. **"Template"** — Used for both **Notification Templates** (email/WhatsApp content) and **Certificate Templates** (pdfme PDF designs). Always qualify: "notification template" or "certificate template."

4. **"Status"** — Every major entity has its own status enum. Never say "status" without the entity: "registration status," "event status," "batch status," "flag status," "notification status," "certificate status."

5. **"Event"** — Overloaded between the business concept (**Event** = a conference) and the technical concept (**Domain Event** = an Inngest message like `conference/travel.updated`). In code, use `event` for the conference entity and `domainEvent` or `cascadeEvent` for Inngest payloads. In UI, always "Event" means the conference.

6. **"Trigger"** — Used for both **Automation Triggers** (the database rows binding domain events to notification sends) and **Domain Events** (the things that "trigger" the cascades). In code and docs, "trigger" always means the **Automation Trigger** row. The thing that fires is a "domain event."

7. **"Assignment"** — Used for both **Session Assignments** (person → session → role) and **Vehicle Assignments** (vehicle → batch) and **Passenger Assignments** (person → vehicle). Always qualify: "session assignment," "vehicle assignment," "passenger assignment."

8. **"Flag"** vs **"Feature Flag"** — A **Red Flag** is an ops review alert on a logistics record. A **Feature Flag** is an Upstash Redis toggle for system capabilities. Completely different. Never say just "flag" without context.

9. **"Module Toggle"** vs **"Feature Flag"** — **Module Toggles** are per-event JSONB booleans on the event record (sessions enabled, QR enabled). **Feature Flags** are system-wide Redis keys (WhatsApp globally enabled, email provider switch). Different scope, different storage, different purpose.

10. **"Registration" vs "Check-in"** — **Registration** is the enrollment action (online, before the event). **Check-in** is the physical arrival action (at the venue, during the event). A person can be registered but not checked in, or checked in multiple times across days. These are separate records in separate tables.
