import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockGenerateExport } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
  },
  mockGenerateExport: vi.fn(),
}));

vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn(() => ({
      addWorksheet: vi.fn(() => ({
        addRow: vi.fn(),
        getRow: vi.fn(() => ({ eachCell: vi.fn(), height: 0 })),
        columns: [],
      })),
      xlsx: { writeBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-xlsx-content')) },
    })),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/exports/excel', () => ({ generateExport: mockGenerateExport }));

import { generateGlobalExport } from './reports';
import { ROLES } from '@/lib/auth/roles';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({
    userId: 'user-sa',
    sessionClaims: { metadata: { appRole: 'super_admin' } },
  });
  mockGenerateExport.mockResolvedValue(Buffer.from('excel-data'));
});

describe('generateGlobalExport adversarial coverage', () => {
  it('should reject unknown export types for single-event exports', async () => {
    // BUG: single-event mode trusts the runtime type and forwards unknown exports to generateExport.
    const result = await generateGlobalExport(
      VALID_EVENT_ID,
      'definitely-not-a-real-export' as never,
    );

    expect(result).toEqual({
      ok: false,
      error: 'Unknown export type: definitely-not-a-real-export',
    });
    expect(mockGenerateExport).not.toHaveBeenCalled();
  });
});
