# Spec 04: Cascade System

Module: accommodation
Source: feature-census/accommodation/CENSUS.md

## Checkpoints

### CP-39: Cascade trigger fields defined correctly
- **Action:** Check ACCOM_CASCADE_TRIGGER_FIELDS
- **Pass:** Exactly ['hotelName', 'checkInDate', 'checkOutDate', 'hotelCity', 'sharedRoomGroup']
- **Fail:** Missing or extra fields

### CP-40: Change summary detects hotel name change
- **Action:** buildAccommodationChangeSummary({ hotelName: 'A' }, { hotelName: 'B' })
- **Pass:** Returns { hotelName: { from: 'A', to: 'B' } }
- **Fail:** Missing or wrong change

### CP-41: Change summary ignores non-cascade fields
- **Action:** buildAccommodationChangeSummary({ roomNumber: '1' }, { roomNumber: '2' })
- **Pass:** Returns empty object {}
- **Fail:** Includes roomNumber change

### CP-42: hasAccomCascadeTriggerChanges returns true for cascade changes
- **Action:** Check with hotelCity changed
- **Pass:** Returns true
- **Fail:** Returns false

### CP-43: hasAccomCascadeTriggerChanges returns false for non-cascade changes
- **Action:** Check with only roomNumber changed
- **Pass:** Returns false
- **Fail:** Returns true

### CP-44: Accommodation update flags transport passenger assignments
- **Action:** Call handleAccommodationUpdated with changeSummary for a person who has transport assignments
- **Pass:** Red flag created on each transport_passenger_assignment with type='accommodation_change'
- **Fail:** No flags created or wrong flag type

### CP-45: Shared room group change flags co-occupants
- **Action:** Call handleAccommodationUpdated with sharedRoomGroup in changeSummary
- **Pass:** Red flags created on co-occupant accommodation_records with type='shared_room_affected'
- **Fail:** No flags on co-occupants

### CP-46: Accommodation cancellation flags transport
- **Action:** Call handleAccommodationCancelled for person with transport assignments
- **Pass:** Red flags with type='accommodation_cancelled' on transport_passenger_assignments
- **Fail:** No flags created

### CP-47: Inngest function retries accommodation.updated 3 times
- **Action:** Check accommodationUpdatedFn configuration
- **Pass:** retries=3, trigger='conference/accommodation.updated'
- **Fail:** Wrong retry count or trigger

### CP-48: Inngest function retries accommodation.cancelled 3 times
- **Action:** Check accommodationCancelledFn configuration
- **Pass:** retries=3, trigger='conference/accommodation.cancelled'
- **Fail:** Wrong retry count or trigger
