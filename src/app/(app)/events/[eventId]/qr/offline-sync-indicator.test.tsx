import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';

// ── Shared mocks ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/components/shared/QrScanner', () => ({
  QrScanner: (props: any) => createElement('div', { 'data-testid': 'qr-scanner', 'data-event': props.eventId }),
}));
vi.mock('@/components/shared/ScanFeedback', () => ({
  ScanFeedback: (props: any) => props.result ? createElement('div', { 'data-testid': 'scan-feedback' }, props.result.message) : null,
}));
vi.mock('@/components/shared/CheckInSearch', () => ({
  CheckInSearch: (props: any) => createElement('div', { 'data-testid': 'check-in-search', 'data-event': props.eventId }),
}));

// ── Online/offline + sync state mocks ──

let mockIsOnline = true;
let mockSyncState = {
  syncStatus: 'idle' as 'idle' | 'syncing' | 'synced' | 'error',
  pendingCount: 0,
  lastSyncedCount: 0,
  lastSyncError: null as string | null,
  syncNow: vi.fn(),
};

vi.mock('@/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => mockIsOnline,
}));

vi.mock('@/lib/hooks/use-offline-sync', () => ({
  useOfflineSync: () => mockSyncState,
}));

import { QrCheckInClient } from './qr-checkin-client';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const emptyStats = { totalCheckedIn: 0, byMethod: {}, bySession: {} };

function render() {
  return renderToStaticMarkup(
    createElement(QrCheckInClient, {
      eventId: EVENT_ID,
      initialStats: emptyStats,
      initialRecords: [],
      totalRegistrations: 100,
    }),
  );
}

describe('7B-2: Offline sync indicator and manual trigger', () => {
  it('shows amber offline banner with message when device is offline', () => {
    mockIsOnline = false;
    mockSyncState = { ...mockSyncState, syncStatus: 'idle', pendingCount: 0 };

    const html = render();
    expect(html).toContain('data-testid="offline-banner"');
    expect(html).toContain('You are offline');
    expect(html).toContain('scans will sync when connected');
  });

  it('shows queued count badge in offline banner when scans are pending', () => {
    mockIsOnline = false;
    mockSyncState = { ...mockSyncState, syncStatus: 'idle', pendingCount: 3, lastSyncedCount: 0 };

    const html = render();
    expect(html).toContain('data-testid="queued-count-badge"');
    expect(html).toContain('3 queued');
  });

  it('shows green synced banner with count after reconnect sync', () => {
    mockIsOnline = true;
    mockSyncState = { ...mockSyncState, syncStatus: 'synced', pendingCount: 0, lastSyncedCount: 5 };

    const html = render();
    expect(html).toContain('data-testid="synced-banner"');
    expect(html).toContain('Synced 5 check-ins');
  });

  it('shows manual Sync Now button when online with pending scans', () => {
    mockIsOnline = true;
    mockSyncState = { ...mockSyncState, syncStatus: 'idle', pendingCount: 2, lastSyncedCount: 0 };

    const html = render();
    expect(html).toContain('data-testid="manual-sync-btn"');
    expect(html).toContain('Sync Now (2)');
  });

  it('shows sync error banner with retry when sync fails', () => {
    mockIsOnline = true;
    mockSyncState = { ...mockSyncState, syncStatus: 'error', pendingCount: 3, lastSyncError: 'Network timeout', lastSyncedCount: 0 };

    const html = render();
    expect(html).toContain('data-testid="sync-error-banner"');
    expect(html).toContain('Sync failed: Network timeout');
    expect(html).toContain('data-testid="retry-sync-btn"');
  });

  // ── Codex adversarial tests ──

  it('does not show synced banner when pending scans still remain (partial sync)', () => {
    mockIsOnline = true;
    mockSyncState = { ...mockSyncState, syncStatus: 'synced', pendingCount: 2, lastSyncedCount: 3 };

    const html = render();
    // Bug 1 fix: synced banner must NOT show when pendingCount > 0
    expect(html).not.toContain('data-testid="synced-banner"');
    // But manual sync button should be visible for remaining scans
    expect(html).toContain('data-testid="manual-sync-btn"');
  });

  it('does not show offline banner or synced banner when online with no sync activity', () => {
    mockIsOnline = true;
    mockSyncState = { ...mockSyncState, syncStatus: 'idle', pendingCount: 0, lastSyncedCount: 0, lastSyncError: null };

    const html = render();
    expect(html).not.toContain('data-testid="offline-banner"');
    expect(html).not.toContain('data-testid="synced-banner"');
    expect(html).not.toContain('data-testid="sync-error-banner"');
    expect(html).not.toContain('data-testid="manual-sync-btn"');
  });

  it('QrScanner cleans up cooldown timer on unmount (bug 3 fix)', () => {
    const scannerPath = new URL('../../../../../components/shared/QrScanner.tsx', import.meta.url);
    const scannerSource = fs.readFileSync(scannerPath, 'utf8');
    // Must use a ref-tracked timer that gets cleaned up
    expect(scannerSource).toContain('cooldownTimerRef');
    expect(scannerSource).toContain('clearTimeout(cooldownTimerRef.current)');
  });

  it('useOfflineSync guards state updates with mountedRef (bug 4 fix)', () => {
    const hookPath = new URL('../../../../../lib/hooks/use-offline-sync.ts', import.meta.url);
    const hookSource = fs.readFileSync(hookPath, 'utf8');
    expect(hookSource).toContain('mountedRef');
    expect(hookSource).toContain('if (!mountedRef.current) return');
  });
});
