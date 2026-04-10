# Spec 05: Auth & Event Scope

STATUS: COMPLETE
TESTED: 5/5
PASS: 5
FAIL: 0

Covers: S1, S2, S3, S4

## Checkpoints

- [x] [CP-01] All read actions (getEventTransportBatches, getTransportBatch, getBatchVehicles, getBatchPassengers) call assertEventAccess
- [x] [CP-02] All write actions call assertEventAccess with requireWrite: true
- [x] [CP-03] All queries use withEventScope to filter by eventId
- [x] [CP-04] Server pages redirect to /login when assertEventAccess fails
- [x] [CP-05] Batch detail page returns notFound() when batch doesn't exist
