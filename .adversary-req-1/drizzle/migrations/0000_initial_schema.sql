-- GEM India Conference App — Initial Schema Migration
-- Generated: 2026-04-07
-- Source: .planning/data-requirements.md → /db-architect
-- All tables, indexes, and constraints for V1.

-- ═══════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS (future multi-tenancy anchor)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active TEXT NOT NULL DEFAULT 'true',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 2. EVENTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'completed', 'archived', 'cancelled')),
  archived_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  venue_name TEXT,
  venue_address TEXT,
  venue_city TEXT,
  venue_map_url TEXT,
  module_toggles JSONB NOT NULL DEFAULT '{}',
  field_config JSONB NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}',
  registration_settings JSONB NOT NULL DEFAULT '{}',
  communication_settings JSONB NOT NULL DEFAULT '{}',
  public_page_settings JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX idx_events_organization_id ON events (organization_id);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_start_date ON events (start_date);

-- ═══════════════════════════════════════════════════════════════
-- 3. HALLS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE halls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity TEXT,
  sort_order TEXT NOT NULL DEFAULT '0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);

CREATE INDEX idx_halls_event_id ON halls (event_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. EVENT USER ASSIGNMENTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE event_user_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  auth_user_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL DEFAULT 'collaborator'
    CHECK (assignment_type IN ('owner', 'collaborator')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, auth_user_id)
);

CREATE INDEX idx_event_user_assignments_event_id ON event_user_assignments (event_id);
CREATE INDEX idx_event_user_assignments_auth_user_id ON event_user_assignments (auth_user_id);

-- ═══════════════════════════════════════════════════════════════
-- 5. PEOPLE (Master People Database)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salutation TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone_e164 TEXT,
  designation TEXT,
  specialty TEXT,
  organization TEXT,
  city TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  anonymized_at TIMESTAMPTZ,
  anonymized_by TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- At least one of email or phone_e164 must be present
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);

CREATE INDEX idx_people_email ON people (email);
CREATE INDEX idx_people_phone_e164 ON people (phone_e164);
CREATE INDEX idx_people_full_name ON people (full_name);
CREATE INDEX idx_people_organization ON people (organization);
CREATE INDEX idx_people_city ON people (city);
CREATE INDEX idx_people_specialty ON people (specialty);
CREATE INDEX idx_people_active ON people (full_name) WHERE archived_at IS NULL AND anonymized_at IS NULL;
CREATE INDEX idx_people_tags ON people USING GIN (tags);

-- ═══════════════════════════════════════════════════════════════
-- 6. SESSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parent_session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  session_date TIMESTAMPTZ,
  start_at_utc TIMESTAMPTZ,
  end_at_utc TIMESTAMPTZ,
  hall_id UUID REFERENCES halls(id) ON DELETE SET NULL,
  session_type TEXT NOT NULL DEFAULT 'other'
    CHECK (session_type IN ('keynote', 'panel', 'workshop', 'free_paper', 'plenary', 'symposium', 'break', 'lunch', 'registration', 'other')),
  track TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  cme_credits INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'completed', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_event_id ON sessions (event_id);
CREATE INDEX idx_sessions_hall_id ON sessions (hall_id);
CREATE INDEX idx_sessions_parent_session_id ON sessions (parent_session_id);
CREATE INDEX idx_sessions_event_status ON sessions (event_id, status);
CREATE INDEX idx_sessions_event_date ON sessions (event_id, session_date);
CREATE INDEX idx_sessions_event_hall_start ON sessions (event_id, hall_id, start_at_utc);

-- ═══════════════════════════════════════════════════════════════
-- 7. SESSION ROLE REQUIREMENTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE session_role_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('speaker', 'chair', 'co_chair', 'moderator', 'panelist', 'discussant', 'presenter')),
  required_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, role)
);

CREATE INDEX idx_session_role_reqs_session_id ON session_role_requirements (session_id);

-- ═══════════════════════════════════════════════════════════════
-- 8. SESSION ASSIGNMENTS (Session-Faculty Junction)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE session_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  role TEXT NOT NULL
    CHECK (role IN ('speaker', 'chair', 'co_chair', 'moderator', 'panelist', 'discussant', 'presenter')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  presentation_title TEXT,
  presentation_duration_minutes INTEGER,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id, role)
);

CREATE INDEX idx_session_assignments_event_id ON session_assignments (event_id);
CREATE INDEX idx_session_assignments_session_id ON session_assignments (session_id);
CREATE INDEX idx_session_assignments_person_id ON session_assignments (person_id);
CREATE INDEX idx_session_assignments_event_person ON session_assignments (event_id, person_id);
CREATE INDEX idx_session_assignments_session_sort ON session_assignments (session_id, sort_order);

-- ═══════════════════════════════════════════════════════════════
-- 9. FACULTY INVITES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE faculty_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'opened', 'accepted', 'declined', 'expired')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  program_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_faculty_invites_event_id ON faculty_invites (event_id);
CREATE INDEX idx_faculty_invites_person_id ON faculty_invites (person_id);
CREATE INDEX idx_faculty_invites_event_person ON faculty_invites (event_id, person_id);
CREATE INDEX idx_faculty_invites_token ON faculty_invites (token);
CREATE INDEX idx_faculty_invites_status ON faculty_invites (status);

-- ═══════════════════════════════════════════════════════════════
-- 10. PROGRAM VERSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE program_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  base_version_id UUID REFERENCES program_versions(id),
  snapshot_json JSONB NOT NULL,
  changes_summary_json JSONB,
  changes_description TEXT,
  affected_person_ids_json JSONB,
  publish_reason TEXT,
  notification_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (notification_status IN ('not_required', 'pending', 'sent', 'partially_failed', 'failed')),
  notification_triggered_at TIMESTAMPTZ,
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, version_no)
);

CREATE INDEX idx_program_versions_event_id ON program_versions (event_id);
CREATE INDEX idx_program_versions_base ON program_versions (base_version_id);

-- Add FK from faculty_invites to program_versions
ALTER TABLE faculty_invites
  ADD CONSTRAINT fk_faculty_invites_program_version
  FOREIGN KEY (program_version_id) REFERENCES program_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_faculty_invites_program_version ON faculty_invites (program_version_id);

-- ═══════════════════════════════════════════════════════════════
-- 11. EVENT REGISTRATIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  registration_number TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'delegate'
    CHECK (category IN ('delegate', 'faculty', 'invited_guest', 'sponsor', 'volunteer')),
  age INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'waitlisted', 'declined', 'cancelled')),
  preferences_json JSONB NOT NULL DEFAULT '{}',
  qr_code_token TEXT NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, person_id)
);

CREATE INDEX idx_event_registrations_event_id ON event_registrations (event_id);
CREATE INDEX idx_event_registrations_person_id ON event_registrations (person_id);
CREATE INDEX idx_event_registrations_event_status ON event_registrations (event_id, status);
CREATE INDEX idx_event_registrations_event_category ON event_registrations (event_id, category);
CREATE INDEX idx_event_registrations_qr_token ON event_registrations (qr_code_token);
CREATE INDEX idx_event_registrations_reg_number ON event_registrations (registration_number);

-- ═══════════════════════════════════════════════════════════════
-- 12. TRAVEL RECORDS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE travel_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'intercity', 'other')),
  travel_mode TEXT NOT NULL CHECK (travel_mode IN ('flight', 'train', 'car', 'bus', 'self_arranged', 'other')),
  from_city TEXT NOT NULL,
  from_location TEXT,
  to_city TEXT NOT NULL,
  to_location TEXT,
  departure_at_utc TIMESTAMPTZ,
  arrival_at_utc TIMESTAMPTZ,
  carrier_name TEXT,
  service_number TEXT,
  pnr_or_booking_ref TEXT,
  seat_or_coach TEXT,
  terminal_or_gate TEXT,
  attachment_url TEXT,
  record_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (record_status IN ('draft', 'confirmed', 'sent', 'changed', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_travel_records_event_id ON travel_records (event_id);
CREATE INDEX idx_travel_records_person_id ON travel_records (person_id);
CREATE INDEX idx_travel_records_registration_id ON travel_records (registration_id);
CREATE INDEX idx_travel_records_event_person ON travel_records (event_id, person_id);
CREATE INDEX idx_travel_records_event_direction ON travel_records (event_id, direction);
CREATE INDEX idx_travel_records_event_status ON travel_records (event_id, record_status);
CREATE INDEX idx_travel_records_arrival ON travel_records (event_id, arrival_at_utc);

-- ═══════════════════════════════════════════════════════════════
-- 13. ACCOMMODATION RECORDS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE accommodation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
  hotel_name TEXT NOT NULL,
  hotel_address TEXT,
  hotel_city TEXT,
  google_maps_url TEXT,
  room_type TEXT,
  room_number TEXT,
  shared_room_group TEXT,
  check_in_date TIMESTAMPTZ NOT NULL,
  check_out_date TIMESTAMPTZ NOT NULL,
  booking_reference TEXT,
  attachment_url TEXT,
  special_requests TEXT,
  record_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (record_status IN ('draft', 'confirmed', 'sent', 'changed', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accommodation_records_event_id ON accommodation_records (event_id);
CREATE INDEX idx_accommodation_records_person_id ON accommodation_records (person_id);
CREATE INDEX idx_accommodation_records_registration_id ON accommodation_records (registration_id);
CREATE INDEX idx_accommodation_records_event_person ON accommodation_records (event_id, person_id);
CREATE INDEX idx_accommodation_records_event_status ON accommodation_records (event_id, record_status);
CREATE INDEX idx_accommodation_records_shared_group ON accommodation_records (event_id, shared_room_group);
CREATE INDEX idx_accommodation_records_hotel ON accommodation_records (event_id, hotel_name);

-- ═══════════════════════════════════════════════════════════════
-- 14. TRANSPORT BATCHES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE transport_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('arrival', 'departure')),
  batch_source TEXT NOT NULL DEFAULT 'manual' CHECK (batch_source IN ('auto', 'manual')),
  service_date TIMESTAMPTZ NOT NULL,
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  source_city TEXT NOT NULL,
  pickup_hub TEXT NOT NULL,
  pickup_hub_type TEXT NOT NULL DEFAULT 'other'
    CHECK (pickup_hub_type IN ('airport', 'railway_station', 'hotel', 'venue', 'other')),
  drop_hub TEXT NOT NULL,
  drop_hub_type TEXT NOT NULL DEFAULT 'other'
    CHECK (drop_hub_type IN ('hotel', 'venue', 'airport', 'railway_station', 'other')),
  batch_status TEXT NOT NULL DEFAULT 'planned'
    CHECK (batch_status IN ('planned', 'ready', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transport_batches_event_id ON transport_batches (event_id);
CREATE INDEX idx_transport_batches_event_date ON transport_batches (event_id, service_date);
CREATE INDEX idx_transport_batches_event_movement ON transport_batches (event_id, movement_type);
CREATE INDEX idx_transport_batches_event_status ON transport_batches (event_id, batch_status);
CREATE INDEX idx_transport_batches_pickup_hub ON transport_batches (event_id, pickup_hub);

-- ═══════════════════════════════════════════════════════════════
-- 15. VEHICLE ASSIGNMENTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES transport_batches(id) ON DELETE CASCADE,
  vehicle_label TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('sedan', 'suv', 'van', 'tempo_traveller', 'bus', 'other')),
  plate_number TEXT,
  vendor_name TEXT,
  vendor_contact_e164 TEXT,
  driver_name TEXT,
  driver_mobile_e164 TEXT,
  capacity INTEGER NOT NULL,
  scheduled_pickup_at_utc TIMESTAMPTZ,
  scheduled_drop_at_utc TIMESTAMPTZ,
  assignment_status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (assignment_status IN ('assigned', 'dispatched', 'completed', 'cancelled')),
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicle_assignments_event_id ON vehicle_assignments (event_id);
CREATE INDEX idx_vehicle_assignments_batch_id ON vehicle_assignments (batch_id);
CREATE INDEX idx_vehicle_assignments_status ON vehicle_assignments (assignment_status);

-- ═══════════════════════════════════════════════════════════════
-- 16. TRANSPORT PASSENGER ASSIGNMENTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE transport_passenger_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES transport_batches(id) ON DELETE CASCADE,
  vehicle_assignment_id UUID REFERENCES vehicle_assignments(id) ON DELETE SET NULL,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  travel_record_id UUID NOT NULL REFERENCES travel_records(id) ON DELETE RESTRICT,
  assignment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (assignment_status IN ('pending', 'assigned', 'boarded', 'completed', 'no_show', 'cancelled')),
  pickup_note TEXT,
  drop_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transport_passenger_event_id ON transport_passenger_assignments (event_id);
CREATE INDEX idx_transport_passenger_batch_id ON transport_passenger_assignments (batch_id);
CREATE INDEX idx_transport_passenger_vehicle_id ON transport_passenger_assignments (vehicle_assignment_id);
CREATE INDEX idx_transport_passenger_person_id ON transport_passenger_assignments (person_id);
CREATE INDEX idx_transport_passenger_travel_id ON transport_passenger_assignments (travel_record_id);
CREATE INDEX idx_transport_passenger_status ON transport_passenger_assignments (batch_id, assignment_status);

-- ═══════════════════════════════════════════════════════════════
-- 17. CERTIFICATE TEMPLATES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE certificate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  certificate_type TEXT NOT NULL
    CHECK (certificate_type IN ('delegate_attendance', 'faculty_participation', 'speaker_recognition', 'chairperson_recognition', 'panelist_recognition', 'moderator_recognition', 'cme_attendance')),
  audience_scope TEXT NOT NULL
    CHECK (audience_scope IN ('delegate', 'faculty', 'speaker', 'chairperson', 'panelist', 'moderator', 'mixed')),
  template_json JSONB NOT NULL,
  page_size TEXT NOT NULL DEFAULT 'A4_landscape' CHECK (page_size IN ('A4_landscape', 'A4_portrait')),
  orientation TEXT NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait')),
  allowed_variables_json JSONB NOT NULL DEFAULT '[]',
  required_variables_json JSONB NOT NULL DEFAULT '[]',
  default_file_name_pattern TEXT NOT NULL DEFAULT '{{full_name}}-{{event_name}}-certificate.pdf',
  preview_thumbnail_url TEXT,
  signature_config_json JSONB,
  branding_snapshot_json JSONB,
  qr_verification_enabled BOOLEAN NOT NULL DEFAULT true,
  verification_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version_no INTEGER NOT NULL DEFAULT 1,
  is_system_template BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX idx_cert_templates_event_id ON certificate_templates (event_id);
CREATE INDEX idx_cert_templates_event_type ON certificate_templates (event_id, certificate_type);
CREATE INDEX idx_cert_templates_status ON certificate_templates (status);
-- Partial unique: one active template per event + type
CREATE UNIQUE INDEX uq_cert_template_active ON certificate_templates (event_id, certificate_type) WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════
-- 18. ISSUED CERTIFICATES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE issued_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL REFERENCES certificate_templates(id) ON DELETE RESTRICT,
  template_version_no INTEGER NOT NULL,
  certificate_type TEXT NOT NULL,
  eligibility_basis_type TEXT NOT NULL
    CHECK (eligibility_basis_type IN ('registration', 'attendance', 'session_assignment', 'event_role', 'manual')),
  eligibility_basis_id UUID,
  certificate_number TEXT NOT NULL UNIQUE,
  verification_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  file_checksum_sha256 TEXT,
  rendered_variables_json JSONB NOT NULL,
  branding_snapshot_json JSONB,
  template_snapshot_json JSONB,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'superseded', 'revoked')),
  superseded_by_id UUID REFERENCES issued_certificates(id),
  supersedes_id UUID REFERENCES issued_certificates(id),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  last_sent_at TIMESTAMPTZ,
  last_downloaded_at TIMESTAMPTZ,
  download_count INTEGER NOT NULL DEFAULT 0,
  last_verified_at TIMESTAMPTZ,
  verification_count INTEGER NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_issued_certs_event_id ON issued_certificates (event_id);
CREATE INDEX idx_issued_certs_person_id ON issued_certificates (person_id);
CREATE INDEX idx_issued_certs_template_id ON issued_certificates (template_id);
CREATE INDEX idx_issued_certs_event_person ON issued_certificates (event_id, person_id);
CREATE INDEX idx_issued_certs_event_type ON issued_certificates (event_id, certificate_type);
CREATE INDEX idx_issued_certs_cert_number ON issued_certificates (certificate_number);
CREATE INDEX idx_issued_certs_verification ON issued_certificates (verification_token);
CREATE INDEX idx_issued_certs_status ON issued_certificates (status);
CREATE INDEX idx_issued_certs_superseded_by ON issued_certificates (superseded_by_id);
CREATE INDEX idx_issued_certs_supersedes ON issued_certificates (supersedes_id);

-- ═══════════════════════════════════════════════════════════════
-- 19. NOTIFICATION TEMPLATES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  template_name TEXT NOT NULL,
  meta_category TEXT NOT NULL
    CHECK (meta_category IN ('registration', 'program', 'logistics', 'certificates', 'reminders', 'system')),
  trigger_type TEXT,
  send_mode TEXT NOT NULL DEFAULT 'manual' CHECK (send_mode IN ('automatic', 'manual', 'both')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version_no INTEGER NOT NULL DEFAULT 1,
  subject_line TEXT,
  body_content TEXT NOT NULL,
  preview_text TEXT,
  allowed_variables_json JSONB NOT NULL DEFAULT '[]',
  required_variables_json JSONB NOT NULL DEFAULT '[]',
  branding_mode TEXT NOT NULL DEFAULT 'event_branding'
    CHECK (branding_mode IN ('event_branding', 'global_branding', 'custom')),
  custom_branding_json JSONB,
  whatsapp_template_name TEXT,
  whatsapp_language_code TEXT,
  is_system_template BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  last_activated_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX idx_notif_templates_event_id ON notification_templates (event_id);
CREATE INDEX idx_notif_templates_key_channel ON notification_templates (template_key, channel);
CREATE INDEX idx_notif_templates_status ON notification_templates (status);
CREATE INDEX idx_notif_templates_category ON notification_templates (meta_category);
-- Partial unique: one active template per event + channel + key
CREATE UNIQUE INDEX uq_notif_template_active ON notification_templates (event_id, channel, template_key) WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════
-- 20. NOTIFICATION LOG
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  template_key_snapshot TEXT,
  template_version_no INTEGER,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  provider TEXT NOT NULL CHECK (provider IN ('resend', 'evolution_api', 'waba')),
  trigger_type TEXT,
  trigger_entity_type TEXT,
  trigger_entity_id UUID,
  send_mode TEXT NOT NULL CHECK (send_mode IN ('automatic', 'manual')),
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient_email TEXT,
  recipient_phone_e164 TEXT,
  rendered_subject TEXT,
  rendered_body TEXT NOT NULL,
  rendered_variables_json JSONB,
  attachment_manifest_json JSONB,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'retrying')),
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error_code TEXT,
  last_error_message TEXT,
  last_attempt_at TIMESTAMPTZ,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  provider_message_id TEXT,
  provider_conversation_id TEXT,
  is_resend BOOLEAN NOT NULL DEFAULT false,
  resend_of_id UUID REFERENCES notification_log(id),
  initiated_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_log_event_id ON notification_log (event_id);
CREATE INDEX idx_notif_log_person_id ON notification_log (person_id);
CREATE INDEX idx_notif_log_template_id ON notification_log (template_id);
CREATE INDEX idx_notif_log_event_person ON notification_log (event_id, person_id);
CREATE INDEX idx_notif_log_event_status ON notification_log (event_id, status);
CREATE INDEX idx_notif_log_event_channel ON notification_log (event_id, channel);
CREATE INDEX idx_notif_log_idempotency ON notification_log (idempotency_key);
CREATE INDEX idx_notif_log_trigger ON notification_log (trigger_entity_type, trigger_entity_id);
CREATE INDEX idx_notif_log_resend_of ON notification_log (resend_of_id);
CREATE INDEX idx_notif_log_provider_msg ON notification_log (provider_message_id);
CREATE INDEX idx_notif_log_failed ON notification_log (event_id, status) WHERE status = 'failed';

-- ═══════════════════════════════════════════════════════════════
-- 21. NOTIFICATION DELIVERY EVENTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE notification_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_log_id UUID NOT NULL REFERENCES notification_log(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider_payload_json JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_delivery_log_id ON notification_delivery_events (notification_log_id);
CREATE INDEX idx_notif_delivery_event_type ON notification_delivery_events (event_type);

-- ═══════════════════════════════════════════════════════════════
-- 22. AUTOMATION TRIGGERS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE automation_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  trigger_event_type TEXT NOT NULL,
  guard_condition_json JSONB,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  template_id UUID NOT NULL REFERENCES notification_templates(id) ON DELETE RESTRICT,
  recipient_resolution TEXT NOT NULL
    CHECK (recipient_resolution IN ('trigger_person', 'session_faculty', 'event_faculty', 'ops_team')),
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  idempotency_scope TEXT NOT NULL DEFAULT 'per_person_per_trigger_entity_per_channel',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_triggers_event_id ON automation_triggers (event_id);
CREATE INDEX idx_automation_triggers_template_id ON automation_triggers (template_id);
CREATE INDEX idx_automation_triggers_event_type ON automation_triggers (event_id, trigger_event_type);
CREATE INDEX idx_automation_triggers_enabled ON automation_triggers (event_id, is_enabled);

-- ═══════════════════════════════════════════════════════════════
-- 23. RED FLAGS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE red_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL
    CHECK (flag_type IN ('travel_change', 'travel_cancelled', 'accommodation_change', 'accommodation_cancelled', 'registration_cancelled', 'shared_room_affected')),
  flag_detail TEXT NOT NULL,
  target_entity_type TEXT NOT NULL
    CHECK (target_entity_type IN ('accommodation_record', 'transport_batch', 'transport_passenger_assignment')),
  target_entity_id UUID NOT NULL,
  source_entity_type TEXT NOT NULL
    CHECK (source_entity_type IN ('travel_record', 'accommodation_record', 'registration')),
  source_entity_id UUID NOT NULL,
  source_change_summary_json JSONB,
  flag_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (flag_status IN ('unreviewed', 'reviewed', 'resolved')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_red_flags_event_id ON red_flags (event_id);
CREATE INDEX idx_red_flags_event_status ON red_flags (event_id, flag_status);
CREATE INDEX idx_red_flags_target ON red_flags (target_entity_type, target_entity_id);
CREATE INDEX idx_red_flags_source ON red_flags (source_entity_type, source_entity_id);
CREATE INDEX idx_red_flags_unreviewed ON red_flags (event_id) WHERE flag_status = 'unreviewed';
-- One active unresolved flag per target + type
CREATE UNIQUE INDEX uq_red_flag_active ON red_flags (event_id, target_entity_type, target_entity_id, flag_type) WHERE flag_status != 'resolved';

-- ═══════════════════════════════════════════════════════════════
-- 24. ATTENDANCE RECORDS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  check_in_method TEXT NOT NULL
    CHECK (check_in_method IN ('qr_scan', 'manual_search', 'kiosk', 'self_service')),
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_in_by TEXT,
  synced_at TIMESTAMPTZ,
  offline_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, person_id, session_id)
);

CREATE INDEX idx_attendance_event_id ON attendance_records (event_id);
CREATE INDEX idx_attendance_person_id ON attendance_records (person_id);
CREATE INDEX idx_attendance_registration_id ON attendance_records (registration_id);
CREATE INDEX idx_attendance_session_id ON attendance_records (session_id);
CREATE INDEX idx_attendance_event_person ON attendance_records (event_id, person_id);

-- ═══════════════════════════════════════════════════════════════
-- DONE. 24 tables, 95+ indexes, all FKs indexed.
-- ═══════════════════════════════════════════════════════════════
