# Spec 02: Vehicle Lifecycle

STATUS: COMPLETE
TESTED: 10/10
PASS: 10
FAIL: 0

Covers: A6, A7, A8, V2, V7, V8, S2

## Checkpoints

- [x] [CP-01] createVehicleAssignment creates vehicle with status "assigned" within valid batch
- [x] [CP-02] createVehicleAssignment rejects when batch not found (event scoped)
- [x] [CP-03] createVehicleAssignment rejects capacity < 1 or > 100
- [x] [CP-04] createVehicleAssignment rejects invalid vehicleType
- [x] [CP-05] createVehicleAssignment stores optional fields (plateNumber, vendor, driver, scheduled times)
- [x] [CP-06] updateVehicleStatus allows assigned -> dispatched -> completed
- [x] [CP-07] updateVehicleStatus allows cancellation from assigned or dispatched
- [x] [CP-08] updateVehicleStatus rejects transitions from terminal states
- [x] [CP-09] updateVehicleStatus throws when vehicle not found
- [x] [CP-10] getBatchVehicles returns only vehicles for the given batchId and eventId
