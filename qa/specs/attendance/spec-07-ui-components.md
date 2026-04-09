# Spec 07: UI Components & Page

## Source
- `src/app/(app)/events/[eventId]/qr/qr-checkin-client.tsx`
- `src/components/shared/ScanFeedback.tsx`
- `src/components/shared/CheckInSearch.tsx`
- `src/components/shared/QrScanner.tsx`

## Checkpoints

### CP-01: QrCheckInClient renders three-panel layout
- Expected: Scanner, Last Scan Result, Statistics panels present

### CP-02: Statistics show total/checked-in/remaining
- Input: totalRegistrations=100, totalCheckedIn=40
- Expected: Total=100, Checked In=40, Remaining=60

### CP-03: Remaining clamped to 0 when checked-in exceeds total
- Input: totalRegistrations=10, totalCheckedIn=15
- Expected: Remaining=0

### CP-04: Method breakdown shows QR Scans and Manual counts
- Input: byMethod: { qr_scan: 30, manual_search: 10 }
- Expected: QR Scans=30, Manual=10

### CP-05: Manual check-in toggle switches panels
- Input: click toggle button
- Expected: QR scanner replaced by CheckInSearch; button text changes

### CP-06: Toggle button has aria-pressed attribute
- Expected: aria-pressed="false" initially, "true" when active

### CP-07: Offline banner shows when not online
- Input: isOnline=false
- Expected: amber banner with "You are offline" message

### CP-08: Queued count badge in offline banner
- Input: isOnline=false, pendingCount=5
- Expected: badge showing "5 queued"

### CP-09: Synced banner after successful sync
- Input: syncStatus='synced', lastSyncedCount=3, pendingCount=0
- Expected: green banner "Synced 3 check-ins"

### CP-10: Sync error banner with retry
- Input: syncStatus='error', lastSyncError="Network timeout"
- Expected: red banner with error message and Retry button

### CP-11: Connectivity badge with aria-live
- Expected: green "Online" or amber "Offline" with role="status" and aria-live="polite"

### CP-12: Attendance log shows recent check-ins
- Input: initialRecords with entries
- Expected: table with Name, Reg #, Method, Time columns

### CP-13: Timestamps formatted in IST
- Input: checkInAt in UTC
- Expected: displayed time uses timeZone: 'Asia/Kolkata'

### CP-14: Auto-dismiss ScanFeedback after 3 seconds
- Input: scan result set
- Expected: clears to null after 3000ms

### CP-15: ScanFeedback — success shows green with person details
- Input: result type='success'
- Expected: green styling, personName, registrationNumber, category

### CP-16: ScanFeedback — duplicate shows yellow
- Input: result type='duplicate'
- Expected: yellow/amber styling

### CP-17: ScanFeedback — invalid shows red without person details
- Input: result type='invalid'
- Expected: red styling, no person metadata

### CP-18: ScanFeedback — ineligible shows orange
- Input: result type='ineligible'
- Expected: orange styling with person details

### CP-19: ScanFeedback has dismiss button when onDismiss provided
- Expected: button renders with handler

### CP-20: ScanFeedback includes aria-live for accessibility
- Expected: region with aria-live attribute for screen readers

### CP-21: Manual sync button visible when online with pending
- Input: isOnline=true, pendingCount>0
- Expected: "Sync Now (N)" button visible

### CP-22: Safe area bottom padding for notched devices
- Expected: bottom bar has safe-area-pb class
