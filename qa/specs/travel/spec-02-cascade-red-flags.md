# Spec 02: Travel Cascade — Red Flag Upserts

**Census refs:** D1, D2, D5, D6
**Test file:** `src/lib/cascade/handlers/travel-cascade.test.ts`

## Checkpoints

- [ ] CP-01: Travel update flags non-cancelled accommodation records for same person
- [ ] CP-02: Travel update flags transport passenger assignments for same travel record
- [ ] CP-03: Travel update flag detail includes changed field names
- [ ] CP-04: Travel cancel flags accommodation records (high severity)
- [ ] CP-05: Travel cancel flags transport passenger assignments
- [ ] CP-06: Travel cancel flag detail includes cancellation reason
- [ ] CP-07: No flags created when no related accommodation/transport records exist (current behavior)
- [ ] CP-08: Cancelled accommodation records are excluded from flagging (ne filter)
- [ ] CP-09: Cancelled transport assignments are excluded from flagging (ne filter)
