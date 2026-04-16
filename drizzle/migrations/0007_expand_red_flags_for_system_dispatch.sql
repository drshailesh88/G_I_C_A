-- Allow cascade dead-letter failures to create operator-visible red flags.
ALTER TABLE red_flags DROP CONSTRAINT IF EXISTS red_flags_flag_type_check;
ALTER TABLE red_flags
  ADD CONSTRAINT red_flags_flag_type_check
  CHECK (flag_type IN (
    'travel_change',
    'travel_cancelled',
    'accommodation_change',
    'accommodation_cancelled',
    'registration_cancelled',
    'shared_room_affected',
    'system_dispatch_failure'
  ));

ALTER TABLE red_flags DROP CONSTRAINT IF EXISTS red_flags_target_entity_type_check;
ALTER TABLE red_flags
  ADD CONSTRAINT red_flags_target_entity_type_check
  CHECK (target_entity_type IN (
    'accommodation_record',
    'transport_batch',
    'transport_passenger_assignment',
    'notification_log'
  ));

ALTER TABLE red_flags DROP CONSTRAINT IF EXISTS red_flags_source_entity_type_check;
ALTER TABLE red_flags
  ADD CONSTRAINT red_flags_source_entity_type_check
  CHECK (source_entity_type IN (
    'travel_record',
    'accommodation_record',
    'registration',
    'cascade_dispatch'
  ));
