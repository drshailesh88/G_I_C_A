# Spec 03: Passenger Assignment & Movement

STATUS: COMPLETE
TESTED: 16/16
PASS: 16
FAIL: 0

Covers: A9, A10, A11, A12, V3, V9, V10, S6

## Checkpoints

- [x] [CP-01] assignPassenger without vehicleAssignmentId creates assignment with status "pending"
- [x] [CP-02] assignPassenger with vehicleAssignmentId creates assignment with status "assigned"
- [x] [CP-03] assignPassenger rejects when batch not found
- [x] [CP-04] assignPassenger rejects invalid UUIDs for personId or travelRecordId
- [x] [CP-05] movePassenger to a vehicle sets status to "assigned"
- [x] [CP-06] movePassenger to unassigned (empty targetVehicleAssignmentId) sets status to "pending" and vehicleAssignmentId to null
- [x] [CP-07] movePassenger blocks moves on completed passengers
- [x] [CP-08] movePassenger blocks moves on cancelled passengers
- [x] [CP-09] movePassenger blocks moves on no_show passengers
- [x] [CP-10] updatePassengerStatus allows pending -> assigned -> boarded -> completed
- [x] [CP-11] updatePassengerStatus allows pending -> boarded (ops override)
- [x] [CP-12] updatePassengerStatus allows assigned -> no_show
- [x] [CP-13] updatePassengerStatus rejects transitions from terminal states (completed, no_show, cancelled)
- [x] [CP-14] updatePassengerStatus throws when not found
- [x] [CP-15] getBatchPassengers returns passengers with person name and phone joined
- [x] [CP-16] getBatchPassengers only returns passengers scoped to eventId and batchId
