# Spec 01: Batch Lifecycle

STATUS: COMPLETE
TESTED: 17/17
PASS: 17
FAIL: 0

Covers: A1, A2, A3, A4, A5, V1, V4, V5, V6, S2, S5

## Checkpoints

- [x] [CP-01] createTransportBatch with valid input returns batch with status "planned" and all fields populated
- [x] [CP-02] createTransportBatch rejects when timeWindowEnd <= timeWindowStart
- [x] [CP-03] createTransportBatch rejects invalid movementType (not arrival/departure)
- [x] [CP-04] createTransportBatch rejects empty sourceCity, pickupHub, or dropHub
- [x] [CP-05] createTransportBatch defaults batchSource to "manual" when not provided
- [x] [CP-06] createTransportBatch defaults pickupHubType/dropHubType to "other" when not provided
- [x] [CP-07] updateTransportBatch allows partial field updates (only sourceCity changed)
- [x] [CP-08] updateTransportBatch blocks updates on completed batches
- [x] [CP-09] updateTransportBatch blocks updates on cancelled batches
- [x] [CP-10] updateTransportBatch throws when batch not found (wrong eventId scope)
- [x] [CP-11] updateBatchStatus allows full happy path: planned -> ready -> in_progress -> completed
- [x] [CP-12] updateBatchStatus allows cancellation from any non-terminal state
- [x] [CP-13] updateBatchStatus rejects skipping steps (planned -> in_progress)
- [x] [CP-14] updateBatchStatus rejects transitions from terminal states (completed -> anything)
- [x] [CP-15] getEventTransportBatches returns only batches for the given eventId
- [x] [CP-16] getEventTransportBatches returns batches sorted by serviceDate descending
- [x] [CP-17] getTransportBatch throws when batchId does not belong to eventId
