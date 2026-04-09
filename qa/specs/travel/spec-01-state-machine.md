# Spec 01: Travel Record State Machine — All Transitions

**Census refs:** C1-C14
**Test file:** `src/lib/actions/travel.test.ts`

## Checkpoints

- [x] CP-01: draft → confirmed (existing)
- [x] CP-02: draft → cancelled (existing — via cancelTravelRecord)
- [ ] CP-03: confirmed → sent
- [ ] CP-04: confirmed → changed
- [x] CP-05: confirmed → cancelled (existing)
- [ ] CP-06: sent → changed
- [ ] CP-07: sent → cancelled
- [ ] CP-08: changed → confirmed
- [ ] CP-09: changed → sent
- [ ] CP-10: changed → cancelled
- [x] CP-11: cancelled → anything rejected (existing)
- [ ] CP-12: draft → sent rejected (invalid)
- [ ] CP-13: draft → changed rejected (invalid)
- [x] CP-14: Auto-mark confirmed as 'changed' on update (existing)
- [ ] CP-15: Auto-mark sent as 'changed' on update
