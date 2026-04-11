-- Add missing event_people junction used by travel, registration,
-- accommodation, program, and certificate flows.
CREATE TABLE event_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_people UNIQUE (event_id, person_id)
);

CREATE INDEX idx_event_people_event_id ON event_people (event_id);
CREATE INDEX idx_event_people_person_id ON event_people (person_id);
