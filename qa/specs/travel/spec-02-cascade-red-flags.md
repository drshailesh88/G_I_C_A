# Spec 02: Travel Cascade — Red Flag Upserts

**Census refs:** D1, D2, D5, D6
**Test file:** `src/lib/cascade/handlers/travel-cascade.test.ts`
**Status:** ALL PASSING (9/9)

## Checkpoints

- [x] CP-01: Travel update flags non-cancelled accommodation records for same person
- [x] CP-02: Travel update flags transport passenger assignments for same travel record
- [x] CP-03: Travel update flag detail includes changed field names
- [x] CP-04: Travel cancel flags accommodation records (high severity)
- [x] CP-05: Travel cancel flags transport passenger assignments
- [x] CP-06: Travel cancel flag detail includes cancellation reason
- [x] CP-07: No flags created when no related accommodation/transport records exist (current behavior)
- [x] CP-08: Cancelled accommodation records are excluded from flagging (ne filter)
- [x] CP-09: Cancelled transport assignments are excluded from flagging (ne filter)
