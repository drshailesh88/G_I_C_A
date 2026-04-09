# Spec 06: Red Flag System

Module: accommodation
Source: feature-census/accommodation/CENSUS.md

## Checkpoints

### CP-60: Flag types include accommodation-related types
- **Action:** Check FLAG_TYPES array
- **Pass:** Includes 'accommodation_change', 'accommodation_cancelled', 'shared_room_affected'
- **Fail:** Missing any accommodation flag type

### CP-61: Review flag transitions unreviewed -> reviewed
- **Action:** Call reviewFlag on an unreviewed flag
- **Pass:** Flag status becomes 'reviewed', reviewedBy set
- **Fail:** Status unchanged or error

### CP-62: Resolve flag transitions reviewed -> resolved
- **Action:** Call resolveFlag on a reviewed flag
- **Pass:** Flag status becomes 'resolved', resolvedBy set
- **Fail:** Status unchanged or error

### CP-63: Resolve flag can skip reviewed (unreviewed -> resolved)
- **Action:** Call resolveFlag on an unreviewed flag
- **Pass:** Flag status becomes 'resolved' (Super Admin skip)
- **Fail:** Must go through reviewed first

### CP-64: Flagged-only filter shows only flagged records
- **Action:** Toggle showFlaggedOnly=true with mix of flagged and unflagged records
- **Pass:** Only records whose IDs are in flaggedIds are displayed
- **Fail:** All records shown or none shown

### CP-65: Flag detail shows change description
- **Action:** Create flag with detail "Accommodation updated: hotelName changed"
- **Pass:** Detail text rendered in flag badge
- **Fail:** Generic or missing detail

### CP-66: Flag age displays relative time
- **Action:** Flag created 2 hours ago
- **Pass:** Shows "about 2 hours ago" via formatDistanceToNow
- **Fail:** Shows raw timestamp or nothing
