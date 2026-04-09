# Spec 06: Offline Queue & Sync Hooks

## Source
- `src/lib/attendance/offline-queue.ts` — IndexedDB operations
- `src/lib/hooks/use-offline-sync.ts` — useOfflineSync hook
- `src/lib/hooks/use-online-status.ts` — useOnlineStatus hook

## Checkpoints

### CP-01: generateScanId produces unique IDs with scan- prefix
- Input: multiple calls to generateScanId()
- Expected: all start with "scan-", all unique

### CP-02: generateScanId contains timestamp component
- Input: call generateScanId()
- Expected: ID contains numeric timestamp portion

### CP-03: Module exports all expected functions
- Input: import from offline-queue
- Expected: queueOfflineScan, getPendingScans, markScansAsSynced, clearSyncedScans, getPendingCount, generateScanId all defined

### CP-04: OfflineScanRecord type shape
- Input: valid record { id, qrPayload, sessionId, scannedAt, deviceId, synced }
- Expected: TypeScript accepts the shape

### CP-05: useOnlineStatus returns boolean
- Input: hook rendered in test
- Expected: returns true (SSR default) or actual navigator.onLine

### CP-06: useOfflineSync returns correct shape
- Input: hook with eventId
- Expected: { syncStatus, pendingCount, lastSyncedCount, lastSyncError, syncNow }

### CP-07: useOfflineSync auto-syncs on connectivity return
- Input: simulate offline→online transition
- Expected: syncNow called after ~1s debounce

### CP-08: useOfflineSync prevents concurrent syncs
- Input: call syncNow while already syncing
- Expected: second call is no-op (syncingRef guard)

### CP-09: useOfflineSync safe async updates after unmount
- Input: unmount component during sync
- Expected: no state updates (mountedRef guard)
