# Spec 06: Validation Schemas & Constants

STATUS: COMPLETE
TESTED: 10/10
PASS: 10
FAIL: 0

Covers: V4-V11, enums

## Checkpoints

- [x] [CP-01] MOVEMENT_TYPES contains exactly ['arrival', 'departure']
- [x] [CP-02] HUB_TYPES contains exactly 5 types including 'airport' and 'railway_station'
- [x] [CP-03] VEHICLE_TYPES contains exactly 6 types including 'tempo_traveller'
- [x] [CP-04] BATCH_SOURCES contains exactly ['auto', 'manual']
- [x] [CP-05] createBatchSchema rejects notes longer than 2000 characters
- [x] [CP-06] createVehicleSchema coerces capacity from string to number
- [x] [CP-07] assignPassengerSchema accepts empty string for vehicleAssignmentId
- [x] [CP-08] movePassengerSchema accepts empty string for targetVehicleAssignmentId (= unassign)
- [x] [CP-09] All ID schemas validate UUID format
- [x] [CP-10] updateBatchSchema allows all fields to be optional except batchId
