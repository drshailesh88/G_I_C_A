# Spec 02: Vehicle Lifecycle

Covers: A6, A7, A8, V2, V7, V8, S2

## Checkpoints

- [CP-01] createVehicleAssignment creates vehicle with status "assigned" within valid batch
- [CP-02] createVehicleAssignment rejects when batch not found (event scoped)
- [CP-03] createVehicleAssignment rejects capacity < 1 or > 100
- [CP-04] createVehicleAssignment rejects invalid vehicleType
- [CP-05] createVehicleAssignment stores optional fields (plateNumber, vendor, driver, scheduled times)
- [CP-06] updateVehicleStatus allows assigned -> dispatched -> completed
- [CP-07] updateVehicleStatus allows cancellation from assigned or dispatched
- [CP-08] updateVehicleStatus rejects transitions from terminal states
- [CP-09] updateVehicleStatus throws when vehicle not found
- [CP-10] getBatchVehicles returns only vehicles for the given batchId and eventId
