# Spec 01: Batch Lifecycle

Covers: A1, A2, A3, A4, A5, V1, V4, V5, V6, S2, S5

## Checkpoints

- [CP-01] createTransportBatch with valid input returns batch with status "planned" and all fields populated
- [CP-02] createTransportBatch rejects when timeWindowEnd <= timeWindowStart
- [CP-03] createTransportBatch rejects invalid movementType (not arrival/departure)
- [CP-04] createTransportBatch rejects empty sourceCity, pickupHub, or dropHub
- [CP-05] createTransportBatch defaults batchSource to "manual" when not provided
- [CP-06] createTransportBatch defaults pickupHubType/dropHubType to "other" when not provided
- [CP-07] updateTransportBatch allows partial field updates (only sourceCity changed)
- [CP-08] updateTransportBatch blocks updates on completed batches
- [CP-09] updateTransportBatch blocks updates on cancelled batches
- [CP-10] updateTransportBatch throws when batch not found (wrong eventId scope)
- [CP-11] updateBatchStatus allows full happy path: planned -> ready -> in_progress -> completed
- [CP-12] updateBatchStatus allows cancellation from any non-terminal state
- [CP-13] updateBatchStatus rejects skipping steps (planned -> in_progress)
- [CP-14] updateBatchStatus rejects transitions from terminal states (completed -> anything)
- [CP-15] getEventTransportBatches returns only batches for the given eventId
- [CP-16] getEventTransportBatches returns batches sorted by serviceDate descending
- [CP-17] getTransportBatch throws when batchId does not belong to eventId
