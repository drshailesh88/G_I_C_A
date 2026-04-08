CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "event_user_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"auth_user_id" text NOT NULL,
	"assignment_type" text DEFAULT 'collaborator' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_event_user_assignment" UNIQUE("event_id","auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"archived_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"venue_name" text,
	"venue_address" text,
	"venue_city" text,
	"venue_map_url" text,
	"module_toggles" jsonb DEFAULT '{}' NOT NULL,
	"field_config" jsonb DEFAULT '{}' NOT NULL,
	"branding" jsonb DEFAULT '{}' NOT NULL,
	"registration_settings" jsonb DEFAULT '{}' NOT NULL,
	"communication_settings" jsonb DEFAULT '{}' NOT NULL,
	"public_page_settings" jsonb DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_events_org_slug" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "halls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" text,
	"sort_order" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_halls_event_name" UNIQUE("event_id","name")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salutation" text,
	"full_name" text NOT NULL,
	"email" text,
	"phone_e164" text,
	"designation" text,
	"specialty" text,
	"organization" text,
	"city" text,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"anonymized_at" timestamp with time zone,
	"anonymized_by" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_event_people" UNIQUE("event_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "faculty_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"program_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faculty_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "program_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"base_version_id" uuid,
	"snapshot_json" jsonb NOT NULL,
	"changes_summary_json" jsonb,
	"changes_description" text,
	"affected_person_ids_json" jsonb,
	"publish_reason" text,
	"notification_status" text DEFAULT 'not_required' NOT NULL,
	"notification_triggered_at" timestamp with time zone,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_program_version" UNIQUE("event_id","version_no")
);
--> statement-breakpoint
CREATE TABLE "session_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"presentation_title" text,
	"presentation_duration_minutes" integer,
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_session_assignment" UNIQUE("session_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "session_role_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"required_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_session_role_req" UNIQUE("session_id","role")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"parent_session_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"session_date" timestamp with time zone,
	"start_at_utc" timestamp with time zone,
	"end_at_utc" timestamp with time zone,
	"hall_id" uuid,
	"session_type" text DEFAULT 'other' NOT NULL,
	"track" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"cme_credits" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"registration_number" text NOT NULL,
	"category" text DEFAULT 'delegate' NOT NULL,
	"age" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"preferences_json" jsonb DEFAULT '{}' NOT NULL,
	"qr_code_token" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_registrations_registration_number_unique" UNIQUE("registration_number"),
	CONSTRAINT "event_registrations_qr_code_token_unique" UNIQUE("qr_code_token"),
	CONSTRAINT "uq_event_registration" UNIQUE("event_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "accommodation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"registration_id" uuid,
	"hotel_name" text NOT NULL,
	"hotel_address" text,
	"hotel_city" text,
	"google_maps_url" text,
	"room_type" text,
	"room_number" text,
	"shared_room_group" text,
	"check_in_date" timestamp with time zone NOT NULL,
	"check_out_date" timestamp with time zone NOT NULL,
	"booking_reference" text,
	"attachment_url" text,
	"special_requests" text,
	"record_status" text DEFAULT 'draft' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"batch_source" text DEFAULT 'manual' NOT NULL,
	"service_date" timestamp with time zone NOT NULL,
	"time_window_start" timestamp with time zone NOT NULL,
	"time_window_end" timestamp with time zone NOT NULL,
	"source_city" text NOT NULL,
	"pickup_hub" text NOT NULL,
	"pickup_hub_type" text DEFAULT 'other' NOT NULL,
	"drop_hub" text NOT NULL,
	"drop_hub_type" text DEFAULT 'other' NOT NULL,
	"batch_status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_passenger_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"vehicle_assignment_id" uuid,
	"person_id" uuid NOT NULL,
	"travel_record_id" uuid NOT NULL,
	"assignment_status" text DEFAULT 'pending' NOT NULL,
	"pickup_note" text,
	"drop_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"registration_id" uuid,
	"direction" text NOT NULL,
	"travel_mode" text NOT NULL,
	"from_city" text NOT NULL,
	"from_location" text,
	"to_city" text NOT NULL,
	"to_location" text,
	"departure_at_utc" timestamp with time zone,
	"arrival_at_utc" timestamp with time zone,
	"carrier_name" text,
	"service_number" text,
	"pnr_or_booking_ref" text,
	"seat_or_coach" text,
	"terminal_or_gate" text,
	"attachment_url" text,
	"record_status" text DEFAULT 'draft' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"vehicle_label" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"plate_number" text,
	"vendor_name" text,
	"vendor_contact_e164" text,
	"driver_name" text,
	"driver_mobile_e164" text,
	"capacity" integer NOT NULL,
	"scheduled_pickup_at_utc" timestamp with time zone,
	"scheduled_drop_at_utc" timestamp with time zone,
	"assignment_status" text DEFAULT 'assigned' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"template_name" text NOT NULL,
	"certificate_type" text NOT NULL,
	"audience_scope" text NOT NULL,
	"template_json" jsonb NOT NULL,
	"page_size" text DEFAULT 'A4_landscape' NOT NULL,
	"orientation" text DEFAULT 'landscape' NOT NULL,
	"allowed_variables_json" jsonb DEFAULT '[]' NOT NULL,
	"required_variables_json" jsonb DEFAULT '[]' NOT NULL,
	"default_file_name_pattern" text DEFAULT '{{full_name}}-{{event_name}}-certificate.pdf' NOT NULL,
	"preview_thumbnail_url" text,
	"signature_config_json" jsonb,
	"branding_snapshot_json" jsonb,
	"qr_verification_enabled" boolean DEFAULT true NOT NULL,
	"verification_text" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version_no" integer DEFAULT 1 NOT NULL,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "issued_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version_no" integer NOT NULL,
	"certificate_type" text NOT NULL,
	"eligibility_basis_type" text NOT NULL,
	"eligibility_basis_id" uuid,
	"certificate_number" text NOT NULL,
	"verification_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size_bytes" integer,
	"file_checksum_sha256" text,
	"rendered_variables_json" jsonb NOT NULL,
	"branding_snapshot_json" jsonb,
	"template_snapshot_json" jsonb,
	"status" text DEFAULT 'issued' NOT NULL,
	"superseded_by_id" uuid,
	"supersedes_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"last_sent_at" timestamp with time zone,
	"last_downloaded_at" timestamp with time zone,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_verified_at" timestamp with time zone,
	"verification_count" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issued_certificates_certificate_number_unique" UNIQUE("certificate_number"),
	CONSTRAINT "issued_certificates_verification_token_unique" UNIQUE("verification_token")
);
--> statement-breakpoint
CREATE TABLE "automation_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"trigger_event_type" text NOT NULL,
	"guard_condition_json" jsonb,
	"channel" text NOT NULL,
	"template_id" uuid NOT NULL,
	"recipient_resolution" text NOT NULL,
	"delay_seconds" integer DEFAULT 0 NOT NULL,
	"idempotency_scope" text DEFAULT 'per_person_per_trigger_entity_per_channel' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer,
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_log_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"provider_payload_json" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"template_id" uuid,
	"template_key_snapshot" text,
	"template_version_no" integer,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"trigger_type" text,
	"trigger_entity_type" text,
	"trigger_entity_id" uuid,
	"send_mode" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"recipient_email" text,
	"recipient_phone_e164" text,
	"rendered_subject" text,
	"rendered_body" text NOT NULL,
	"rendered_variables_json" jsonb,
	"attachment_manifest_json" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"last_attempt_at" timestamp with time zone,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"provider_message_id" text,
	"provider_conversation_id" text,
	"is_resend" boolean DEFAULT false NOT NULL,
	"resend_of_id" uuid,
	"initiated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_log_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "uq_notif_log_provider_msg" UNIQUE("provider","provider_message_id")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"template_key" text NOT NULL,
	"channel" text NOT NULL,
	"template_name" text NOT NULL,
	"meta_category" text NOT NULL,
	"trigger_type" text,
	"send_mode" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version_no" integer DEFAULT 1 NOT NULL,
	"subject_line" text,
	"body_content" text NOT NULL,
	"preview_text" text,
	"allowed_variables_json" jsonb DEFAULT '[]' NOT NULL,
	"required_variables_json" jsonb DEFAULT '[]' NOT NULL,
	"branding_mode" text DEFAULT 'event_branding' NOT NULL,
	"custom_branding_json" jsonb,
	"whatsapp_template_name" text,
	"whatsapp_language_code" text,
	"is_system_template" boolean DEFAULT false NOT NULL,
	"notes" text,
	"last_activated_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "red_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"flag_type" text NOT NULL,
	"flag_detail" text NOT NULL,
	"target_entity_type" text NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"source_entity_type" text NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"source_change_summary_json" jsonb,
	"flag_status" text DEFAULT 'unreviewed' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"registration_id" uuid,
	"session_id" uuid,
	"check_in_method" text NOT NULL,
	"check_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"check_in_by" text,
	"synced_at" timestamp with time zone,
	"offline_device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_attendance_check" UNIQUE("event_id","person_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "event_user_assignments" ADD CONSTRAINT "event_user_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halls" ADD CONSTRAINT "halls_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_people" ADD CONSTRAINT "event_people_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_people" ADD CONSTRAINT "event_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_invites" ADD CONSTRAINT "faculty_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_invites" ADD CONSTRAINT "faculty_invites_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_role_requirements" ADD CONSTRAINT "session_role_requirements_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_records" ADD CONSTRAINT "accommodation_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_records" ADD CONSTRAINT "accommodation_records_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_records" ADD CONSTRAINT "accommodation_records_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_batches" ADD CONSTRAINT "transport_batches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passenger_assignments" ADD CONSTRAINT "transport_passenger_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passenger_assignments" ADD CONSTRAINT "transport_passenger_assignments_batch_id_transport_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."transport_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passenger_assignments" ADD CONSTRAINT "transport_passenger_assignments_vehicle_assignment_id_vehicle_assignments_id_fk" FOREIGN KEY ("vehicle_assignment_id") REFERENCES "public"."vehicle_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passenger_assignments" ADD CONSTRAINT "transport_passenger_assignments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passenger_assignments" ADD CONSTRAINT "transport_passenger_assignments_travel_record_id_travel_records_id_fk" FOREIGN KEY ("travel_record_id") REFERENCES "public"."travel_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_records" ADD CONSTRAINT "travel_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_records" ADD CONSTRAINT "travel_records_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_records" ADD CONSTRAINT "travel_records_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_batch_id_transport_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."transport_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_template_id_certificate_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."certificate_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_template_id_notification_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_events" ADD CONSTRAINT "notification_delivery_events_notification_log_id_notification_log_id_fk" FOREIGN KEY ("notification_log_id") REFERENCES "public"."notification_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_template_id_notification_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_flags" ADD CONSTRAINT "red_flags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_event_user_assignments_event_id" ON "event_user_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_user_assignments_auth_user_id" ON "event_user_assignments" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "idx_events_organization_id" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_events_status" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_events_start_date" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "idx_halls_event_id" ON "halls" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_people_email" ON "people" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_people_phone_e164" ON "people" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "idx_people_full_name" ON "people" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "idx_people_organization" ON "people" USING btree ("organization");--> statement-breakpoint
CREATE INDEX "idx_people_city" ON "people" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_people_specialty" ON "people" USING btree ("specialty");--> statement-breakpoint
CREATE INDEX "idx_people_active" ON "people" USING btree ("full_name") WHERE archived_at IS NULL AND anonymized_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_people_tags" ON "people" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "idx_event_people_event_id" ON "event_people" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_people_person_id" ON "event_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_faculty_invites_event_id" ON "faculty_invites" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_faculty_invites_person_id" ON "faculty_invites" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_faculty_invites_event_person" ON "faculty_invites" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_faculty_invites_token" ON "faculty_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_faculty_invites_status" ON "faculty_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_program_versions_event_id" ON "program_versions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_program_versions_base" ON "program_versions" USING btree ("base_version_id");--> statement-breakpoint
CREATE INDEX "idx_session_assignments_event_id" ON "session_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_session_assignments_session_id" ON "session_assignments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_session_assignments_person_id" ON "session_assignments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_session_assignments_event_person" ON "session_assignments" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_session_assignments_session_sort" ON "session_assignments" USING btree ("session_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_session_role_reqs_session_id" ON "session_role_requirements" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_event_id" ON "sessions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_hall_id" ON "sessions" USING btree ("hall_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_parent_session_id" ON "sessions" USING btree ("parent_session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_event_status" ON "sessions" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "idx_sessions_event_date" ON "sessions" USING btree ("event_id","session_date");--> statement-breakpoint
CREATE INDEX "idx_sessions_event_hall_start" ON "sessions" USING btree ("event_id","hall_id","start_at_utc");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_event_id" ON "event_registrations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_person_id" ON "event_registrations" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_event_status" ON "event_registrations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_event_category" ON "event_registrations" USING btree ("event_id","category");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_qr_token" ON "event_registrations" USING btree ("qr_code_token");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_reg_number" ON "event_registrations" USING btree ("registration_number");--> statement-breakpoint
CREATE INDEX "idx_accommodation_records_event_id" ON "accommodation_records" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_accommodation_records_person_id" ON "accommodation_records" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_accommodation_records_registration_id" ON "accommodation_records" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "idx_accommodation_records_event_person" ON "accommodation_records" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_accommodation_records_event_status" ON "accommodation_records" USING btree ("event_id","record_status");--> statement-breakpoint
CREATE INDEX "idx_accommodation_records_shared_group" ON "accommodation_records" USING btree ("event_id","shared_room_group");--> statement-breakpoint
CREATE INDEX "idx_accommodation_records_hotel" ON "accommodation_records" USING btree ("event_id","hotel_name");--> statement-breakpoint
CREATE INDEX "idx_transport_batches_event_id" ON "transport_batches" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_transport_batches_event_date" ON "transport_batches" USING btree ("event_id","service_date");--> statement-breakpoint
CREATE INDEX "idx_transport_batches_event_movement" ON "transport_batches" USING btree ("event_id","movement_type");--> statement-breakpoint
CREATE INDEX "idx_transport_batches_event_status" ON "transport_batches" USING btree ("event_id","batch_status");--> statement-breakpoint
CREATE INDEX "idx_transport_batches_pickup_hub" ON "transport_batches" USING btree ("event_id","pickup_hub");--> statement-breakpoint
CREATE INDEX "idx_transport_passenger_event_id" ON "transport_passenger_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_transport_passenger_batch_id" ON "transport_passenger_assignments" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_transport_passenger_vehicle_id" ON "transport_passenger_assignments" USING btree ("vehicle_assignment_id");--> statement-breakpoint
CREATE INDEX "idx_transport_passenger_person_id" ON "transport_passenger_assignments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_transport_passenger_travel_id" ON "transport_passenger_assignments" USING btree ("travel_record_id");--> statement-breakpoint
CREATE INDEX "idx_transport_passenger_status" ON "transport_passenger_assignments" USING btree ("batch_id","assignment_status");--> statement-breakpoint
CREATE INDEX "idx_travel_records_event_id" ON "travel_records" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_travel_records_person_id" ON "travel_records" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_travel_records_registration_id" ON "travel_records" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "idx_travel_records_event_person" ON "travel_records" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_travel_records_event_direction" ON "travel_records" USING btree ("event_id","direction");--> statement-breakpoint
CREATE INDEX "idx_travel_records_event_status" ON "travel_records" USING btree ("event_id","record_status");--> statement-breakpoint
CREATE INDEX "idx_travel_records_arrival" ON "travel_records" USING btree ("event_id","arrival_at_utc");--> statement-breakpoint
CREATE INDEX "idx_vehicle_assignments_event_id" ON "vehicle_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_vehicle_assignments_batch_id" ON "vehicle_assignments" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_vehicle_assignments_status" ON "vehicle_assignments" USING btree ("assignment_status");--> statement-breakpoint
CREATE INDEX "idx_cert_templates_event_id" ON "certificate_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_cert_templates_event_type" ON "certificate_templates" USING btree ("event_id","certificate_type");--> statement-breakpoint
CREATE INDEX "idx_cert_templates_status" ON "certificate_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_cert_templates_event_type_status" ON "certificate_templates" USING btree ("event_id","certificate_type","status");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_event_id" ON "issued_certificates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_person_id" ON "issued_certificates" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_template_id" ON "issued_certificates" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_event_person" ON "issued_certificates" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_event_type" ON "issued_certificates" USING btree ("event_id","certificate_type");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_cert_number" ON "issued_certificates" USING btree ("certificate_number");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_verification" ON "issued_certificates" USING btree ("verification_token");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_status" ON "issued_certificates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_superseded_by" ON "issued_certificates" USING btree ("superseded_by_id");--> statement-breakpoint
CREATE INDEX "idx_issued_certs_supersedes" ON "issued_certificates" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "idx_automation_triggers_event_id" ON "automation_triggers" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_automation_triggers_template_id" ON "automation_triggers" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_automation_triggers_event_type" ON "automation_triggers" USING btree ("event_id","trigger_event_type");--> statement-breakpoint
CREATE INDEX "idx_automation_triggers_enabled" ON "automation_triggers" USING btree ("event_id","is_enabled");--> statement-breakpoint
CREATE INDEX "idx_notif_delivery_log_id" ON "notification_delivery_events" USING btree ("notification_log_id");--> statement-breakpoint
CREATE INDEX "idx_notif_delivery_event_type" ON "notification_delivery_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_notif_log_event_id" ON "notification_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_person_id" ON "notification_log" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_template_id" ON "notification_log" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_event_person" ON "notification_log" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_event_status" ON "notification_log" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "idx_notif_log_event_channel" ON "notification_log" USING btree ("event_id","channel");--> statement-breakpoint
CREATE INDEX "idx_notif_log_idempotency" ON "notification_log" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_notif_log_trigger" ON "notification_log" USING btree ("trigger_entity_type","trigger_entity_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_resend_of" ON "notification_log" USING btree ("resend_of_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_provider_msg" ON "notification_log" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_failed" ON "notification_log" USING btree ("event_id","status") WHERE status = 'failed';--> statement-breakpoint
CREATE INDEX "idx_notif_templates_event_id" ON "notification_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_notif_templates_key_channel" ON "notification_templates" USING btree ("template_key","channel");--> statement-breakpoint
CREATE INDEX "idx_notif_templates_status" ON "notification_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notif_templates_category" ON "notification_templates" USING btree ("meta_category");--> statement-breakpoint
CREATE INDEX "idx_notif_templates_event_channel_key_status" ON "notification_templates" USING btree ("event_id","channel","template_key","status");--> statement-breakpoint
CREATE INDEX "idx_red_flags_event_id" ON "red_flags" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_red_flags_event_status" ON "red_flags" USING btree ("event_id","flag_status");--> statement-breakpoint
CREATE INDEX "idx_red_flags_target" ON "red_flags" USING btree ("target_entity_type","target_entity_id");--> statement-breakpoint
CREATE INDEX "idx_red_flags_source" ON "red_flags" USING btree ("source_entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "idx_red_flags_target_type" ON "red_flags" USING btree ("event_id","target_entity_type","target_entity_id","flag_type");--> statement-breakpoint
CREATE INDEX "idx_attendance_event_id" ON "attendance_records" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_person_id" ON "attendance_records" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_registration_id" ON "attendance_records" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_session_id" ON "attendance_records" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_event_person" ON "attendance_records" USING btree ("event_id","person_id");