# Spec 02: Validation (Zod Schemas)

Module: accommodation
Source: feature-census/accommodation/CENSUS.md

## Checkpoints

### CP-13: Require personId as valid UUID
- **Action:** Parse create schema with personId='not-a-uuid'
- **Pass:** Zod throws "Invalid person ID"
- **Fail:** Accepts non-UUID

### CP-14: Require hotelName (min 1, max 300, trimmed)
- **Action:** Parse with hotelName='  ' (whitespace only after trim)
- **Pass:** Zod rejects (min 1 after trim)
- **Fail:** Accepts empty trimmed string

### CP-15: Hotel name max 300 characters
- **Action:** Parse with 301-char hotelName
- **Pass:** Zod rejects
- **Fail:** Accepts oversized name

### CP-16: Require checkInDate
- **Action:** Parse with checkInDate=''
- **Pass:** Zod rejects "Check-in date is required"
- **Fail:** Accepts empty date

### CP-17: Require checkOutDate
- **Action:** Parse with checkOutDate=''
- **Pass:** Zod rejects "Check-out date is required"
- **Fail:** Accepts empty date

### CP-18: Checkout must be after checkin
- **Action:** Parse with checkIn='2026-04-10', checkOut='2026-04-09'
- **Pass:** Zod rejects "Check-out must be after check-in"
- **Fail:** Accepts reverse dates

### CP-19: Same day check-in/check-out rejected
- **Action:** Parse with checkIn='2026-04-10', checkOut='2026-04-10'
- **Pass:** Zod rejects (not strictly after)
- **Fail:** Accepts same-day dates

### CP-20: Room type enum validation
- **Action:** Parse with roomType='penthouse' (not in enum)
- **Pass:** Zod rejects invalid enum value
- **Fail:** Accepts arbitrary room type

### CP-21: Valid room types accepted
- **Action:** Parse with each of: single, double, twin, triple, suite, dormitory, other
- **Pass:** All 7 accepted
- **Fail:** Any valid type rejected

### CP-22: Max length on all optional fields
- **Action:** Parse with hotelAddress at 501 chars, hotelCity at 201, specialRequests at 2001
- **Pass:** Each rejected for exceeding max length
- **Fail:** Accepts oversized optional fields

### CP-23: Cancel schema requires valid UUID
- **Action:** Parse cancel schema with accommodationRecordId='abc'
- **Pass:** Zod rejects "Invalid accommodation record ID"
- **Fail:** Accepts non-UUID

### CP-24: Cancel reason max 500 chars
- **Action:** Parse cancel schema with 501-char reason
- **Pass:** Zod rejects
- **Fail:** Accepts oversized reason

### CP-25: Update schema accommodationRecordId required
- **Action:** Parse update schema without accommodationRecordId
- **Pass:** Zod rejects
- **Fail:** Accepts missing ID

### CP-26: Optional fields accept empty strings
- **Action:** Parse create schema with hotelAddress='', hotelCity='', notes=''
- **Pass:** Accepted (`.optional().or(z.literal(''))`)
- **Fail:** Rejects empty strings
