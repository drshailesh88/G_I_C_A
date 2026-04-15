/**
 * Cascade Handler eventId Audit — CE9, CE19, Invariant 13
 *
 * Static source analysis: every DB query on an event-scoped table in a cascade
 * handler MUST use withEventScope(). The only exception is the `people` table
 * (global master data).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const HANDLERS_DIR = join(__dirname);

const EVENT_SCOPED_TABLES = [
  'accommodationRecords',
  'transportPassengerAssignments',
  'travelRecords',
  'registrations',
  'sessions',
  'certificates',
  'redFlags',
  'notificationLog',
];

const GLOBAL_TABLES = ['people'];

function getHandlerFiles(): string[] {
  return readdirSync(HANDLERS_DIR).filter(
    (f) => f.endsWith('-cascade.ts') && !f.includes('.test.') && !f.includes('.mutation-kill'),
  );
}

function extractFromClauses(source: string): { table: string; lineNum: number }[] {
  const results: { table: string; lineNum: number }[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/\.from\((\w+)\)/);
    if (match) {
      results.push({ table: match[1], lineNum: i + 1 });
    }
  }
  return results;
}

function queryBlockUsesWithEventScope(source: string, lineNum: number): boolean {
  const lines = source.split('\n');
  const start = Math.max(0, lineNum - 8);
  const end = Math.min(lines.length, lineNum + 8);
  const block = lines.slice(start, end).join('\n');
  return block.includes('withEventScope');
}

describe('Cascade handler eventId audit (CE9, CE19, Invariant 13)', () => {
  const handlerFiles = getHandlerFiles();

  it('discovers at least 5 cascade handler files', () => {
    expect(handlerFiles.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of handlerFiles) {
    describe(file, () => {
      const source = readFileSync(join(HANDLERS_DIR, file), 'utf8');
      const fromClauses = extractFromClauses(source);

      const eventScopedQueries = fromClauses.filter((fc) =>
        EVENT_SCOPED_TABLES.includes(fc.table),
      );
      const globalQueries = fromClauses.filter((fc) =>
        GLOBAL_TABLES.includes(fc.table),
      );

      if (eventScopedQueries.length > 0) {
        it('imports withEventScope', () => {
          expect(source).toContain('withEventScope');
        });

        for (const q of eventScopedQueries) {
          it(`line ${q.lineNum}: .from(${q.table}) uses withEventScope`, () => {
            expect(queryBlockUsesWithEventScope(source, q.lineNum)).toBe(true);
          });
        }
      }

      if (globalQueries.length > 0) {
        for (const q of globalQueries) {
          it(`line ${q.lineNum}: .from(${q.table}) does NOT use withEventScope (global table)`, () => {
            expect(queryBlockUsesWithEventScope(source, q.lineNum)).toBe(false);
          });
        }
      }

      if (eventScopedQueries.length === 0 && globalQueries.length === 0) {
        it('has no direct DB queries (notification-only handler)', () => {
          expect(fromClauses.length).toBe(0);
        });
      }
    });
  }
});
