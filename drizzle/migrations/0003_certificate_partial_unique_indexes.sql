-- Enforce "one active template per event + certificate type" at the DB level.
-- Previously only enforced in application code (archive old, then activate new).
-- Concurrent activations could leave multiple active templates.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cert_template_one_active"
  ON "certificate_templates" ("event_id", "certificate_type")
  WHERE "status" = 'active';

-- Enforce "one current issued certificate per person + event + certificate type" at the DB level.
-- Previously only enforced in application code (read existing, then insert + supersede).
-- Concurrent issuances could create duplicate issued rows.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_issued_cert_one_current"
  ON "issued_certificates" ("event_id", "person_id", "certificate_type")
  WHERE "status" = 'issued';
