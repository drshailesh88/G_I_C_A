# Spec 03: Status Machine

Module: accommodation
Source: feature-census/accommodation/CENSUS.md

## Checkpoints

### CP-27: Five statuses defined
- **Action:** Check ACCOMMODATION_RECORD_STATUSES array
- **Pass:** Exactly ['draft', 'confirmed', 'sent', 'changed', 'cancelled']
- **Fail:** Missing or extra statuses

### CP-28: Draft -> confirmed allowed
- **Action:** Check ACCOMMODATION_RECORD_TRANSITIONS.draft
- **Pass:** Includes 'confirmed'
- **Fail:** Missing 'confirmed'

### CP-29: Draft -> cancelled allowed
- **Action:** Check ACCOMMODATION_RECORD_TRANSITIONS.draft
- **Pass:** Includes 'cancelled'
- **Fail:** Missing 'cancelled'

### CP-30: Confirmed -> sent, changed, cancelled allowed
- **Action:** Check ACCOMMODATION_RECORD_TRANSITIONS.confirmed
- **Pass:** Exactly ['sent', 'changed', 'cancelled']
- **Fail:** Wrong transitions

### CP-31: Sent -> changed, cancelled allowed
- **Action:** Check ACCOMMODATION_RECORD_TRANSITIONS.sent
- **Pass:** Exactly ['changed', 'cancelled']
- **Fail:** Wrong transitions

### CP-32: Changed -> confirmed, sent, cancelled allowed
- **Action:** Check ACCOMMODATION_RECORD_TRANSITIONS.changed
- **Pass:** Exactly ['confirmed', 'sent', 'cancelled']
- **Fail:** Wrong transitions

### CP-33: Cancelled is terminal
- **Action:** Check ACCOMMODATION_RECORD_TRANSITIONS.cancelled
- **Pass:** Empty array []
- **Fail:** Has any transitions

### CP-34: Update auto-changes confirmed to "changed"
- **Action:** Update a record with status='confirmed'
- **Pass:** status becomes 'changed' after update
- **Fail:** Status stays 'confirmed'

### CP-35: Update auto-changes sent to "changed"
- **Action:** Update a record with status='sent'
- **Pass:** status becomes 'changed' after update
- **Fail:** Status stays 'sent'

### CP-36: Update does NOT change draft status
- **Action:** Update a record with status='draft'
- **Pass:** status remains 'draft' after update
- **Fail:** Status changes to something else

### CP-37: Cannot update cancelled record
- **Action:** Call updateAccommodationRecord on a cancelled record
- **Pass:** Throws "Cannot update a cancelled accommodation record"
- **Fail:** Update succeeds

### CP-38: Cannot cancel already cancelled record
- **Action:** Call cancelAccommodationRecord on a cancelled record
- **Pass:** Throws error about invalid transition
- **Fail:** Cancellation succeeds or no error
