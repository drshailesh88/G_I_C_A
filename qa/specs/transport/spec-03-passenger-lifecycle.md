# Spec 03: Passenger Assignment & Movement

Covers: A9, A10, A11, A12, V3, V9, V10, S6

## Checkpoints

- [CP-01] assignPassenger without vehicleAssignmentId creates assignment with status "pending"
- [CP-02] assignPassenger with vehicleAssignmentId creates assignment with status "assigned"
- [CP-03] assignPassenger rejects when batch not found
- [CP-04] assignPassenger rejects invalid UUIDs for personId or travelRecordId
- [CP-05] movePassenger to a vehicle sets status to "assigned"
- [CP-06] movePassenger to unassigned (empty targetVehicleAssignmentId) sets status to "pending" and vehicleAssignmentId to null
- [CP-07] movePassenger blocks moves on completed passengers
- [CP-08] movePassenger blocks moves on cancelled passengers
- [CP-09] movePassenger blocks moves on no_show passengers
- [CP-10] updatePassengerStatus allows pending -> assigned -> boarded -> completed
- [CP-11] updatePassengerStatus allows pending -> boarded (ops override)
- [CP-12] updatePassengerStatus allows assigned -> no_show
- [CP-13] updatePassengerStatus rejects transitions from terminal states (completed, no_show, cancelled)
- [CP-14] updatePassengerStatus throws when not found
- [CP-15] getBatchPassengers returns passengers with person name and phone joined
- [CP-16] getBatchPassengers only returns passengers scoped to eventId and batchId
