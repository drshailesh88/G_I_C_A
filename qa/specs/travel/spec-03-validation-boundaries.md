# Spec 03: Travel Validation — Boundary Conditions

**Census refs:** B4-B14
**Test file:** `src/lib/validations/travel.test.ts`

## Checkpoints

- [ ] CP-01: fromCity at exactly 200 chars accepted
- [ ] CP-02: fromCity at 201 chars rejected
- [ ] CP-03: toCity at exactly 200 chars accepted
- [ ] CP-04: toCity at 201 chars rejected
- [ ] CP-05: carrierName at exactly 200 chars accepted
- [ ] CP-06: carrierName at 201 chars rejected
- [ ] CP-07: serviceNumber at exactly 50 chars accepted
- [ ] CP-08: serviceNumber at 51 chars rejected
- [ ] CP-09: pnrOrBookingRef at exactly 50 chars accepted
- [ ] CP-10: pnrOrBookingRef at 51 chars rejected
- [ ] CP-11: notes at exactly 2000 chars accepted
- [ ] CP-12: notes at 2001 chars rejected
- [ ] CP-13: cancel reason at exactly 500 chars accepted
- [ ] CP-14: cancel reason at 501 chars rejected
- [ ] CP-15: fromLocation at exactly 300 chars accepted
- [ ] CP-16: fromLocation at 301 chars rejected
- [ ] CP-17: terminalOrGate at exactly 100 chars accepted
- [ ] CP-18: terminalOrGate at 101 chars rejected
- [ ] CP-19: attachmentUrl at exactly 500 chars accepted
- [ ] CP-20: attachmentUrl at 501 chars rejected
- [ ] CP-21: seatOrCoach at exactly 50 chars accepted
- [ ] CP-22: seatOrCoach at 51 chars rejected
