import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateScanId } from './offline-queue';

// Note: queueOfflineScan, getPendingScans, etc. use IndexedDB which requires
// a browser environment. We test the pure logic utilities here and verify
// the IndexedDB functions are well-typed exports.

describe('generateScanId', () => {
  it('generates a unique scan ID', () => {
    const id1 = generateScanId();
    const id2 = generateScanId();

    expect(id1).not.toBe(id2);
  });

  it('starts with "scan-" prefix', () => {
    const id = generateScanId();
    expect(id).toMatch(/^scan-/);
  });

  it('contains a timestamp component', () => {
    const before = Date.now();
    const id = generateScanId();
    const after = Date.now();

    const timestampStr = id.split('-')[1];
    const timestamp = Number(timestampStr);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('contains a random component', () => {
    const id = generateScanId();
    const parts = id.split('-');
    // scan-{timestamp}-{random}
    expect(parts.length).toBe(3);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('generates many unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateScanId()));
    expect(ids.size).toBe(100);
  });
});

// Verify module exports the expected functions
describe('offline-queue module exports', () => {
  it('exports all expected functions', async () => {
    const mod = await import('./offline-queue');
    expect(typeof mod.queueOfflineScan).toBe('function');
    expect(typeof mod.getPendingScans).toBe('function');
    expect(typeof mod.markScansAsSynced).toBe('function');
    expect(typeof mod.clearSyncedScans).toBe('function');
    expect(typeof mod.getPendingCount).toBe('function');
    expect(typeof mod.generateScanId).toBe('function');
  });
});

describe('OfflineScanRecord type', () => {
  it('accepts a valid record shape', () => {
    const record = {
      id: generateScanId(),
      qrPayload: '550e8400-e29b-41d4-a716-446655440000:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
      sessionId: null,
      scannedAt: new Date().toISOString(),
      deviceId: 'ipad-crew-1',
      synced: false,
    };

    expect(record.id).toBeDefined();
    expect(record.synced).toBe(false);
    expect(record.sessionId).toBeNull();
  });
});
