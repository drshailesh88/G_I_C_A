# Feature Census: Attendance Module

## Layer 1: Code Extraction

### Database Schema
| Feature | File | Description |
|---------|------|-------------|
| attendance_records table | src/lib/db/schema/attendance.ts | id, eventId, personId, registrationId, sessionId, checkInMethod, checkInAt, checkInBy, syncedAt, offlineDeviceId, createdAt, updatedAt |
| Check-in methods enum | src/lib/db/schema/attendance.ts | qr_scan, manual_search, kiosk, self_service |
| Event-scoped indexes | src/lib/db/schema/attendance.ts | Composite index on (eventId, personId) plus individual indexes |
| COALESCE unique index | drizzle/migrations/0002_fix_attendance_null_uniqueness.sql | Handles NULL sessionId in PostgreSQL unique constraint for event-level check-ins |
| ORM relations | src/lib/db/schema/attendance.ts | Belongs to event, person, registration, session |

### QR Utilities (Pure Logic — DB-free)
| Feature | File | Function |
|---------|------|----------|
| Build QR URL payload | src/lib/attendance/qr-utils.ts | buildQrPayloadUrl() — full URL format: baseUrl/checkin?token=X&event=Y |
| Build compact QR payload | src/lib/attendance/qr-utils.ts | buildCompactQrPayload() — format: eventId:token |
| Parse QR payload (dual format) | src/lib/attendance/qr-utils.ts | parseQrPayload() — handles both URL and compact formats |
| Validate QR token | src/lib/attendance/qr-utils.ts | isValidQrToken() — 32-char alphanumeric pattern |
| Check registration eligibility | src/lib/attendance/qr-utils.ts | checkRegistrationEligibility() — only 'confirmed' status, rejects cancelled |
| Determine scan result | src/lib/attendance/qr-utils.ts | determineScanResult() — returns success/duplicate/invalid/ineligible |
| Input normalization | src/lib/attendance/qr-utils.ts | normalizeRequiredString() — trims whitespace, validates non-empty |
| Protocol validation | src/lib/attendance/qr-utils.ts | Restricts QR URLs to http/https only |
| UUID format validation | src/lib/attendance/qr-utils.ts | eventId must match UUID pattern |

### Offline Queue (IndexedDB)
| Feature | File | Function |
|---------|------|----------|
| Queue offline scan | src/lib/attendance/offline-queue.ts | queueOfflineScan() — stores to IndexedDB |
| Get pending scans | src/lib/attendance/offline-queue.ts | getPendingScans() — fetches unsynced records via index |
| Mark scans synced | src/lib/attendance/offline-queue.ts | markScansAsSynced() — updates synced flag |
| Clear synced scans | src/lib/attendance/offline-queue.ts | clearSyncedScans() — deletes synced records |
| Get pending count | src/lib/attendance/offline-queue.ts | getPendingCount() — count of unsynced |
| Generate scan ID | src/lib/attendance/offline-queue.ts | generateScanId() — timestamp + random suffix |
| DB initialization | src/lib/attendance/offline-queue.ts | openDb() — creates DB 'gem-attendance-offline', store 'scan-queue' with synced index |

### Server Actions — Check-in Processing
| Feature | File | Function |
|---------|------|----------|
| Process QR scan | src/lib/actions/checkin.ts | processQrScan() — parse → validate event → lookup registration → duplicate check → insert |
| Process manual check-in | src/lib/actions/checkin.ts | processManualCheckIn() — lookup by registrationId → eligibility → duplicate check → insert |
| Deterministic attendance ID | src/lib/actions/checkin.ts | buildAttendanceRecordId() — SHA-256 of eventId:personId:sessionId → UUID v5 format |
| Duplicate detection (app level) | src/lib/actions/checkin.ts | Queries existing attendance before insert |
| Duplicate detection (DB level) | src/lib/actions/checkin.ts | isDuplicateAttendanceError() — catches PostgreSQL 23505 |
| Event ID cross-check | src/lib/actions/checkin.ts | QR eventId must match current event (case-insensitive) |
| Session-aware duplicate check | src/lib/actions/checkin.ts | buildExistingAttendanceConditions() — checks sessionId or IS NULL |
| Path revalidation on success | src/lib/actions/checkin.ts | revalidatePath(`/events/${eventId}/qr`) |
| RBAC enforcement | src/lib/actions/checkin.ts | assertEventAccess(eventId, { requireWrite: true }) |
| Zod validation | src/lib/actions/checkin.ts | qrScanSchema.parse() / manualCheckInSchema.parse() |

### Server Actions — Batch Sync
| Feature | File | Function |
|---------|------|----------|
| Batch offline sync | src/lib/actions/batch-sync.ts | processBatchSync() — process up to 500 records |
| Per-record error isolation | src/lib/actions/batch-sync.ts | One record failure doesn't abort batch |
| Duplicate handling in batch | src/lib/actions/batch-sync.ts | Catches 23505 per-record, counts as 'duplicate' |
| Offline metadata recording | src/lib/actions/batch-sync.ts | checkInAt from scannedAt, offlineDeviceId, syncedAt |
| Batch result reporting | src/lib/actions/batch-sync.ts | Returns total, synced, duplicates, errors, per-record results |

### Server Actions — Search
| Feature | File | Function |
|---------|------|----------|
| Registration search for check-in | src/lib/actions/checkin-search.ts | searchRegistrationsForCheckIn() — full-text across name, email, phone, reg number |
| SQL injection prevention | src/lib/actions/checkin-search.ts | Escapes \\, %, _ in search query |
| Batch attendance lookup | src/lib/actions/checkin-search.ts | Marks already-checked-in results in batch |
| Session-aware search results | src/lib/actions/checkin-search.ts | Attendance lookup scoped to sessionId or event-level |
| Result limit | src/lib/actions/checkin-search.ts | Max 20 results |

### Server Actions — Attendance Records & Stats
| Feature | File | Function |
|---------|------|----------|
| List attendance records | src/lib/actions/attendance.ts | listAttendanceRecords() — with sessionId/date filters, limit 500 |
| Get attendance stats | src/lib/actions/attendance.ts | getAttendanceStats() — total, by method, by session (transaction) |
| Get confirmed registration count | src/lib/actions/attendance.ts | getConfirmedRegistrationCount() — eligible for check-in |
| Timezone-aware date filter | src/lib/actions/attendance.ts | AT TIME ZONE 'Asia/Kolkata' for date boundaries |
| Read-only access | src/lib/actions/attendance.ts | assertEventAccess(eventId, { requireWrite: false }) |

### Validation Schemas (Zod)
| Feature | File | Schema |
|---------|------|--------|
| QR scan input | src/lib/validations/attendance.ts | qrScanSchema — eventId, qrPayload, optional sessionId/deviceId |
| Manual check-in input | src/lib/validations/attendance.ts | manualCheckInSchema — eventId, registrationId, optional sessionId |
| Attendance query | src/lib/validations/attendance.ts | attendanceQuerySchema — eventId, optional sessionId/date |
| Offline sync item | src/lib/validations/attendance.ts | offlineSyncItemSchema — qrPayload, sessionId, scannedAt (datetime), deviceId |
| Offline sync batch | src/lib/validations/attendance.ts | offlineSyncBatchSchema — eventId + up to 500 records |
| Search query | src/lib/validations/attendance.ts | checkInSearchSchema — eventId + query (max 200 chars) |
| Strict mode | src/lib/validations/attendance.ts | All schemas use .strict() — no extra fields |
| UUID validation | src/lib/validations/attendance.ts | All IDs validated as UUID |

### React Hooks
| Feature | File | Function |
|---------|------|----------|
| Online status detection | src/lib/hooks/use-online-status.ts | useOnlineStatus() — useSyncExternalStore for navigator.onLine |
| SSR safety | src/lib/hooks/use-online-status.ts | getServerSnapshot returns true |
| Offline sync lifecycle | src/lib/hooks/use-offline-sync.ts | useOfflineSync() — syncStatus, pendingCount, lastSyncedCount, lastSyncError, syncNow |
| Auto-sync on reconnect | src/lib/hooks/use-offline-sync.ts | Triggers sync with 1s debounce when connectivity returns |
| Periodic pending count poll | src/lib/hooks/use-offline-sync.ts | Polls every 5 seconds |
| Safe async state updates | src/lib/hooks/use-offline-sync.ts | mountedRef prevents updates after unmount |
| Sync locking | src/lib/hooks/use-offline-sync.ts | syncingRef prevents concurrent sync runs |

### UI Components
| Feature | File | Description |
|---------|------|-------------|
| QR scanner (camera) | src/components/shared/QrScanner.tsx | @yudiel/react-qr-scanner integration with cooldown, online/offline modes |
| Scan feedback display | src/components/shared/ScanFeedback.tsx | Color-coded result cards — green/yellow/red/orange |
| Manual check-in search | src/components/shared/CheckInSearch.tsx | Real-time search + per-registration check-in button |
| QR code generator | src/components/shared/RegistrationQrCode.tsx | qrcode.react SVG, supports URL and compact formats |
| Offline sync indicator | src/app/(app)/events/[eventId]/qr/offline-sync-indicator.test.tsx | (Component for sync status display) |

### Page-Level Features (QrCheckInClient)
| Feature | File | Description |
|---------|------|-------------|
| Three-panel layout | src/app/(app)/events/[eventId]/qr/qr-checkin-client.tsx | Scanner + Result + Stats on desktop, stacked on mobile |
| Toggle QR/Manual mode | qr-checkin-client.tsx | Button toggles between QrScanner and CheckInSearch |
| Offline banner | qr-checkin-client.tsx | Yellow alert with queued count badge when offline |
| Synced banner | qr-checkin-client.tsx | Green success banner after sync completes |
| Sync error banner | qr-checkin-client.tsx | Red banner with retry button on sync failure |
| Statistics cards | qr-checkin-client.tsx | Total, Checked In, Remaining + method breakdown |
| Attendance log table | qr-checkin-client.tsx | Recent 10 check-ins, name/reg#/method/time columns |
| IST timestamps | qr-checkin-client.tsx | toLocaleTimeString with timeZone: 'Asia/Kolkata' |
| Auto-dismiss feedback | qr-checkin-client.tsx | ScanFeedback clears after 3 seconds |
| Manual sync button | qr-checkin-client.tsx | Visible when online with pending scans or after error |
| Connectivity badge | qr-checkin-client.tsx | Green "Online" / Amber "Offline" pill with aria-live |
| Stats refresh after sync | qr-checkin-client.tsx | router.refresh() when sync transitions to 'synced' |
| Remaining clamp to 0 | qr-checkin-client.tsx | Shows 0 when checked-in exceeds total |
| Accessibility: aria-pressed | qr-checkin-client.tsx | Manual toggle exposes pressed state |
| Accessibility: aria-live | qr-checkin-client.tsx | Connectivity badge announces changes |
| Responsive design | qr-checkin-client.tsx | Mobile-first with lg: and xl: breakpoints |
| Safe area padding | qr-checkin-client.tsx | Bottom bar uses safe-area-pb for notched devices |

## Layer 2: Library-Enriched Capabilities
| Library | Capability | Used For |
|---------|-----------|----------|
| @yudiel/react-qr-scanner | Camera-based QR detection | Real-time barcode scanning |
| qrcode.react | SVG QR code generation | Generating QR codes for registration badges |
| zod | Runtime schema validation | All input validation with strict mode |
| drizzle-orm | Type-safe SQL queries | All DB operations with event scoping |
| next/cache (revalidatePath) | On-demand ISR | Fresh stats after check-in |
| IndexedDB (native) | Client-side persistence | Offline scan queue with indexed lookups |

## Summary

| Metric | Count |
|--------|-------|
| **Total capabilities** | 68 |
| **From code** | 62 |
| **From libraries (emergent)** | 6 |
| **Existing tests** | 193 passing |
| **Test files** | 8 |
