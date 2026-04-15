-- One active (non-resolved) red flag per (event_id, target_entity_type, target_entity_id, flag_type).
-- Resolved flags are excluded so a new active flag can be created after resolution.
-- Used by upsertRedFlag's INSERT...ON CONFLICT DO UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_red_flag_active"
  ON "red_flags" ("event_id", "target_entity_type", "target_entity_id", "flag_type")
  WHERE "flag_status" != 'resolved';
