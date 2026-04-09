# Spec 06: Validation Schemas & Constants

Covers: V4-V11, enums

## Checkpoints

- [CP-01] MOVEMENT_TYPES contains exactly ['arrival', 'departure']
- [CP-02] HUB_TYPES contains exactly 5 types including 'airport' and 'railway_station'
- [CP-03] VEHICLE_TYPES contains exactly 6 types including 'tempo_traveller'
- [CP-04] BATCH_SOURCES contains exactly ['auto', 'manual']
- [CP-05] createBatchSchema rejects notes longer than 2000 characters
- [CP-06] createVehicleSchema coerces capacity from string to number
- [CP-07] assignPassengerSchema accepts empty string for vehicleAssignmentId
- [CP-08] movePassengerSchema accepts empty string for targetVehicleAssignmentId (= unassign)
- [CP-09] All ID schemas validate UUID format
- [CP-10] updateBatchSchema allows all fields to be optional except batchId
