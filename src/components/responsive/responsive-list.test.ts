import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./responsive-list.tsx', import.meta.url),
  'utf8',
);

describe('ResponsiveList — source structure', () => {
  it('exports a ResponsiveList component', () => {
    expect(source).toMatch(/export function ResponsiveList/);
  });

  it('uses container queries (containerType inline-size)', () => {
    expect(source).toMatch(/containerType.*inline-size|container-type.*inline-size/);
  });

  it('has card view hidden at 1024px', () => {
    expect(source).toMatch(/@\[1024px\]:hidden/);
  });

  it('has table view visible at 1024px', () => {
    expect(source).toMatch(/hidden @\[1024px\]:block/);
  });

  it('uses theme-aware sticky column backgrounds', () => {
    expect(source).toContain('bg-surface');
    expect(source).not.toContain('bg-white');
  });

  it('supports column priority (high, medium, low)', () => {
    expect(source).toMatch(/priority.*'high'.*'medium'.*'low'/);
  });

  it('hides low-priority columns until 1280px', () => {
    expect(source).toMatch(/@\[1280px\]:table-cell/);
  });

  it('renders cards via renderCard prop', () => {
    expect(source).toMatch(/renderCard\(item\)/);
  });

  it('has loading skeleton states', () => {
    expect(source).toMatch(/SkeletonCards/);
    expect(source).toMatch(/SkeletonTable/);
  });

  it('supports emptyState prop', () => {
    expect(source).toMatch(/emptyState/);
  });

  it('has card grid with responsive columns', () => {
    expect(source).toMatch(/grid-cols-1/);
    expect(source).toMatch(/@\[640px\]:grid-cols-2/);
  });
});
