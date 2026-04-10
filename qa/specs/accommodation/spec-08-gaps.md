# Spec 08: Gap Tests (Not Yet Covered)

Module: accommodation
Source: feature-census/accommodation/CENSUS.md — Discrepancies section
Coverage: vitest (unit/integration) — all checkpoints passing
Playwright: BLOCKED — dev server unresponsive, no Clerk auth infra

STATUS: COMPLETE (vitest)
TESTED: 12/12
PASS: 12
FAIL: 0
BLOCKED: 0
E2E: BLOCKED (no Clerk auth infra, dev server unresponsive)

## Checkpoints

### CP-76: Form room types match schema room types
- **Action:** Compare form <select> options with ROOM_TYPES enum
- **Pass:** Form offers all 7 schema types: single, double, twin, triple, suite, dormitory, other
- **Fail:** Form has 'deluxe' (not in schema) and missing triple, dormitory, other — BUG

### CP-77: Update with all cascade trigger fields changed
- **Action:** Update hotelName + checkInDate + checkOutDate + hotelCity + sharedRoomGroup in one call
- **Pass:** changeSummary contains all 5 fields
- **Fail:** Some fields missing from summary

### CP-78: Cancel with reason appends to existing notes
- **Action:** Cancel record that already has notes="Important VIP"
- **Pass:** Final notes = "Important VIP\nCancellation reason: Budget cut"
- **Fail:** Existing notes overwritten

### CP-79: Create with all optional fields populated
- **Action:** Create with every optional field filled (hotelAddress, hotelCity, googleMapsUrl, roomType, roomNumber, sharedRoomGroup, bookingReference, attachmentUrl, specialRequests, notes)
- **Pass:** All fields persisted correctly
- **Fail:** Any optional field lost

### CP-80: Update sets null for empty optional fields
- **Action:** Update with hotelCity='' (empty string)
- **Pass:** hotelCity stored as null (not empty string)
- **Fail:** Empty string persisted

### CP-81: Shared room affected flag only fires when sharedRoomGroup changes
- **Action:** Update hotelName (but NOT sharedRoomGroup) on record in shared group
- **Pass:** No shared_room_affected flags created on co-occupants
- **Fail:** Co-occupants flagged for non-group change

### CP-82: Multiple concurrent transport assignments all flagged
- **Action:** Accommodation update for person with 3 active transport assignments
- **Pass:** All 3 get accommodation_change red flags
- **Fail:** Only some flagged

### CP-83: Cancel with no transport assignments produces no flags
- **Action:** Cancel accommodation for person with 0 transport assignments
- **Pass:** No flags created, no errors
- **Fail:** Error thrown or phantom flags

### CP-84: Change summary handles null-to-value transitions
- **Action:** buildAccommodationChangeSummary({ hotelCity: null }, { hotelCity: 'Mumbai' })
- **Pass:** Returns { hotelCity: { from: null, to: 'Mumbai' } }
- **Fail:** Throws or misses the change

### CP-85: Change summary handles value-to-null transitions
- **Action:** buildAccommodationChangeSummary({ hotelCity: 'Mumbai' }, { hotelCity: null })
- **Pass:** Returns { hotelCity: { from: 'Mumbai', to: null } }
- **Fail:** Throws or misses the change

### CP-86: Exports rooming list includes accommodation data
- **Action:** Generate rooming-list export for event with accommodation records
- **Pass:** Excel worksheet contains hotel name, room type, dates, person name
- **Fail:** Accommodation data missing from export

### CP-87: Emergency kit backup includes accommodation
- **Action:** Generate emergency kit for event with accommodation records
- **Pass:** Backup data includes accommodation section
- **Fail:** Accommodation data missing from backup
