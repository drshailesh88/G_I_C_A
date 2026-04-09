# Spec 05: Auth & Event Scope

Covers: S1, S2, S3, S4

## Checkpoints

- [CP-01] All read actions (getEventTransportBatches, getTransportBatch, getBatchVehicles, getBatchPassengers) call assertEventAccess
- [CP-02] All write actions call assertEventAccess with requireWrite: true
- [CP-03] All queries use withEventScope to filter by eventId
- [CP-04] Server pages redirect to /login when assertEventAccess fails
- [CP-05] Batch detail page returns notFound() when batch doesn't exist
