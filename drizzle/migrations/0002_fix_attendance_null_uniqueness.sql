-- Fix: PostgreSQL NULL values don't collide in unique constraints.
-- The old unique(event_id, person_id, session_id) allowed duplicate
-- event-level check-ins (session_id IS NULL).
-- This migration replaces it with a COALESCE-based unique index.

DROP INDEX IF EXISTS "uq_attendance_check";

CREATE UNIQUE INDEX "uq_attendance_check"
  ON "attendance_records" (
    "event_id",
    "person_id",
    COALESCE("session_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );
