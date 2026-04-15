-- infra-038: Add audit_log table
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid REFERENCES "events"("id") ON DELETE CASCADE,
  "actor_user_id" text NOT NULL,
  "action" text NOT NULL,
  "resource" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_audit_log_event_id" ON "audit_log" ("event_id");
CREATE INDEX IF NOT EXISTS "idx_audit_log_actor" ON "audit_log" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_log_resource" ON "audit_log" ("resource", "resource_id");
CREATE INDEX IF NOT EXISTS "idx_audit_log_timestamp" ON "audit_log" ("timestamp");
