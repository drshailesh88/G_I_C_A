# Spec 01: Travel Record State Machine — All Transitions

**Census refs:** C1-C14
**Test file:** `src/lib/actions/travel.test.ts`
**Status:** ALL PASSING (15/15)

## Checkpoints

- [x] CP-01: draft → confirmed (existing)
- [x] CP-02: draft → cancelled (existing — via cancelTravelRecord)
- [x] CP-03: confirmed → sent
- [x] CP-04: confirmed → changed
- [x] CP-05: confirmed → cancelled (existing)
- [x] CP-06: sent → changed
- [x] CP-07: sent → cancelled
- [x] CP-08: changed → confirmed
- [x] CP-09: changed → sent
- [x] CP-10: changed → cancelled
- [x] CP-11: cancelled → anything rejected (existing)
- [x] CP-12: draft → sent rejected (invalid)
- [x] CP-13: draft → changed rejected (invalid)
- [x] CP-14: Auto-mark confirmed as 'changed' on update (existing)
- [x] CP-15: Auto-mark sent as 'changed' on update
