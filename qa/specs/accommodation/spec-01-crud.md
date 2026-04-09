# Spec 01: CRUD Operations

Module: accommodation
Source: feature-census/accommodation/CENSUS.md

## Checkpoints

### CP-01: Create accommodation record with valid data
- **Action:** Call `createAccommodationRecord(eventId, validInput)` with all required fields
- **Pass:** Returns record with id, eventId, personId, hotelName, dates, status='draft'
- **Fail:** Throws error or returns incomplete record

### CP-02: Create record auto-upserts event_people junction
- **Action:** Create accommodation for a person not yet in event_people
- **Pass:** event_people row created with source='accommodation'
- **Fail:** No event_people row or wrong source

### CP-03: Create record rejects non-existent person
- **Action:** Call create with personId that doesn't exist in people table
- **Pass:** Throws "Person not found"
- **Fail:** Creates record with invalid personId

### CP-04: Update accommodation record with partial fields
- **Action:** Call `updateAccommodationRecord(eventId, { accommodationRecordId, hotelName: 'New Hotel' })`
- **Pass:** Only hotelName changes, other fields unchanged
- **Fail:** Other fields cleared or error thrown

### CP-05: Cancel accommodation record (soft cancel)
- **Action:** Call `cancelAccommodationRecord(eventId, { accommodationRecordId })`
- **Pass:** recordStatus='cancelled', cancelledAt set, record still exists
- **Fail:** Record deleted or status not updated

### CP-06: Cancel with optional reason appends to notes
- **Action:** Cancel with reason="Budget cut"
- **Pass:** notes field contains "Cancellation reason: Budget cut"
- **Fail:** Reason lost or notes overwritten

### CP-07: List records returns person details
- **Action:** Call `getEventAccommodationRecords(eventId)`
- **Pass:** Each row has personName, personEmail, personPhone from joined people table
- **Fail:** Person fields missing or null when person exists

### CP-08: Get single record returns all fields
- **Action:** Call `getAccommodationRecord(eventId, recordId)`
- **Pass:** Full record returned including hotelAddress, googleMapsUrl, bookingReference, etc.
- **Fail:** Missing fields or wrong record

### CP-09: Get single record throws for wrong eventId
- **Action:** Call getAccommodationRecord with mismatched eventId
- **Pass:** Throws "Accommodation record not found" (eventId scoping)
- **Fail:** Returns record from different event

### CP-10: Get people with travel records filters correctly
- **Action:** Call `getPeopleWithTravelRecords(eventId)` when some people have travel, some don't
- **Pass:** Only people with non-cancelled travel records returned
- **Fail:** Returns people without travel or includes cancelled

### CP-11: Get shared room group members
- **Action:** Call `getSharedRoomGroupMembers(eventId, 'group-A')` with 3 members in group
- **Pass:** Returns all 3 non-cancelled members with personName
- **Fail:** Missing members or includes cancelled

### CP-12: Get shared room group returns empty for empty string
- **Action:** Call `getSharedRoomGroupMembers(eventId, '')`
- **Pass:** Returns empty array
- **Fail:** Returns all records or throws
