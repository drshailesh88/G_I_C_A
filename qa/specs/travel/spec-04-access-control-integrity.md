# Spec 04: Travel Access Control & Data Integrity

**Census refs:** E1-E8, H1-H6
**Test file:** `src/lib/actions/travel-access-integrity.test.ts`
**Status:** ALL PASSING (22/22)

## Access Control Checkpoints

### Write Access Forwarding

- [x] CP-01: updateTravelRecord enforces requireWrite access
- [x] CP-02: cancelTravelRecord enforces requireWrite access
- [x] CP-03: updateTravelRecordStatus enforces requireWrite access

### Read Access Enforcement

- [x] CP-04: getEventTravelRecords rejects when assertEventAccess throws
- [x] CP-05: getTravelRecord rejects when assertEventAccess throws
- [x] CP-06: getPersonTravelRecords rejects when assertEventAccess throws

### Event Scope Isolation

- [x] CP-07: updateTravelRecord uses withEventScope to scope record lookup
- [x] CP-08: cancelTravelRecord uses withEventScope to scope record lookup
- [x] CP-09: updateTravelRecordStatus uses withEventScope to scope record lookup
- [x] CP-10: getTravelRecord uses withEventScope to scope record lookup
- [x] CP-11: getPersonTravelRecords uses withEventScope to scope record lookup

## Data Integrity Checkpoints

### Audit Fields

- [x] CP-12: createTravelRecord sets createdBy to authenticated userId
- [x] CP-13: createTravelRecord sets updatedBy to authenticated userId
- [x] CP-14: updateTravelRecord sets updatedBy to authenticated userId
- [x] CP-15: cancelTravelRecord sets updatedBy to authenticated userId
- [x] CP-16: updateTravelRecordStatus sets updatedBy to authenticated userId
- [x] CP-17: cancelTravelRecord sets cancelledAt to a Date

### Junction Table

- [x] CP-18: createTravelRecord inserts into eventPeople with source 'travel'
- [x] CP-19: createTravelRecord uses onConflictDoNothing for eventPeople

### Path Revalidation

- [x] CP-20: updateTravelRecord revalidates travel path
- [x] CP-21: cancelTravelRecord revalidates travel path
- [x] CP-22: updateTravelRecordStatus revalidates travel path
