import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';

// Mock dependencies
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
vi.mock('@/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/lib/hooks/use-offline-sync', () => ({
  useOfflineSync: () => ({
    syncStatus: 'idle',
    pendingCount: 0,
    lastSyncedCount: 0,
    lastSyncError: null,
    syncNow: vi.fn(),
  }),
}));

import { QrCheckInClient } from './qr-checkin-client';

const componentSource = fs.readFileSync(
  new URL('./qr-checkin-client.tsx', import.meta.url),
  'utf8',
);

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const emptyStats = { totalCheckedIn: 0, byMethod: {}, bySession: {} };
const sampleStats = {
  totalCheckedIn: 42,
  byMethod: { qr_scan: 30, manual_search: 12 },
  bySession: { 'session-1': 20, event_level: 22 },
};

function render(props: Partial<Parameters<typeof QrCheckInClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(QrCheckInClient, {
      eventId: EVENT_ID,
      initialStats: emptyStats,
      initialRecords: [],
      totalRegistrations: 100,
      ...props,
    }),
  );
}

describe('QrCheckInClient', () => {
  // ── Layout tests ──

  it('renders the page title', () => {
    const html = render();
    expect(html).toContain('QR Check-In');
  });

  it('renders three-panel layout with Scanner, Last Scan Result, and Statistics sections', () => {
    const html = render();
    expect(html).toContain('Scanner');
    expect(html).toContain('Last Scan Result');
    expect(html).toContain('Statistics');
  });

  it('renders QR scanner component in default mode (not manual search)', () => {
    const html = render();
    expect(html).toContain('data-testid="qr-scanner"');
    expect(html).not.toContain('data-testid="check-in-search"');
  });

  // ── Stats tests ──

  it('displays total/checked-in/remaining stats', () => {
    const html = render({ totalRegistrations: 100, initialStats: sampleStats });
    // Total registrations
    expect(html).toContain('Total');
    expect(html).toContain('>100<');
    // Checked in
    expect(html).toContain('Checked In');
    expect(html).toContain('>42<');
    // Remaining = 100 - 42 = 58
    expect(html).toContain('Remaining');
    expect(html).toContain('>58<');
  });

  it('shows remaining as 0 when checked-in exceeds total', () => {
    const html = render({
      totalRegistrations: 5,
      initialStats: { totalCheckedIn: 10, byMethod: {}, bySession: {} },
    });
    expect(html).toContain('Remaining');
    expect(html).toContain('>0<');
  });

  it('displays method breakdown (QR Scans and Manual counts)', () => {
    const html = render({ initialStats: sampleStats });
    expect(html).toContain('QR Scans');
    expect(html).toContain('>30<');
    expect(html).toContain('Manual');
    expect(html).toContain('>12<');
  });

  // ── Bottom bar tests ──

  it('renders bottom bar with Manual Check-in toggle and Online connectivity badge', () => {
    const html = render();
    expect(html).toContain('data-testid="bottom-bar"');
    expect(html).toContain('data-testid="manual-checkin-toggle"');
    expect(html).toContain('Manual Check-in');
    expect(html).toContain('data-testid="connectivity-badge"');
    expect(html).toContain('Online');
  });

  it('shows "Waiting for scan..." placeholder when no scan result', () => {
    const html = render();
    expect(html).toContain('Waiting for scan...');
  });

  it('renders recent check-ins in attendance log', () => {
    const html = render({
      initialRecords: [
        {
          id: 'att-1',
          personId: 'person-1',
          fullName: 'Dr. Sharma',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          sessionId: null,
          checkInMethod: 'qr_scan',
          checkInAt: new Date('2026-04-08T10:00:00Z'),
          checkInBy: 'user_123',
          offlineDeviceId: null,
          syncedAt: null,
        },
      ],
    });
    expect(html).toContain('Dr. Sharma');
    expect(html).toContain('Recent Check-ins');
  });

  // ── Codex adversarial tests ──

  it('exposes the Manual Check-in toggle state with aria-pressed for assistive tech', () => {
    expect(componentSource).toContain('aria-pressed');
  });

  it('announces connectivity changes through a live status region', () => {
    expect(componentSource).toContain('role="status"');
    expect(componentSource).toContain('aria-live="polite"');
  });

  it('formats recent check-in timestamps explicitly in IST', () => {
    expect(componentSource).toContain("timeZone: 'Asia/Kolkata'");
  });

  // ── Responsive design tests (DRS-42) ──

  it('uses ResponsiveMetricGrid for stats instead of hardcoded grid-cols-3', () => {
    // grid-cols-3 overflows at 375px — must use auto-reflow pattern
    expect(componentSource).not.toContain('grid-cols-3');
    expect(componentSource).toContain('ResponsiveMetricGrid');
  });

  it('renders stats inside ResponsiveMetricGrid with auto-fit reflow', () => {
    const html = render({ totalRegistrations: 100, initialStats: sampleStats });
    // The auto-fit grid pattern should be in the rendered output
    expect(html).toContain('repeat(auto-fit');
  });

  it('wraps stats panel in a container query scope', () => {
    const html = render();
    // @container class enables container queries on the wrapper
    expect(html).toMatch(/@container/);
  });

  it('has safe-area-pb on the fixed bottom bar', () => {
    expect(componentSource).toContain('safe-area-pb');
  });

  it('imports ResponsiveMetricGrid from the responsive components', () => {
    expect(componentSource).toContain("from '@/components/responsive/responsive-metric-grid'");
  });
});
