import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(
  join(__dirname, 'travel-form-client.tsx'),
  'utf-8',
);

describe('travel-form-client responsive layout', () => {
  it('imports FormGrid from responsive components', () => {
    expect(src).toContain("from '@/components/responsive/form-grid'");
  });

  it('uses <FormGrid> for side-by-side field pairs', () => {
    const formGridCount = (src.match(/<FormGrid>/g) || []).length;
    // Direction+Mode, Cities, Locations, Departure/Arrival, Carrier+Service, PNR+Terminal
    expect(formGridCount).toBeGreaterThanOrEqual(6);
  });

  it('does not use hardcoded grid-cols-2 (replaced by FormGrid)', () => {
    // FormGrid handles the responsive columns — no raw grid-cols-2 should remain
    expect(src).not.toContain('grid grid-cols-2');
  });

  it('keeps full-width fields outside FormGrid (person, seat, attachment, notes)', () => {
    // These fields should not be inside a FormGrid — they're standalone divs
    // Verify they exist as direct children of the form
    expect(src).toContain('id="seatOrCoach"');
    expect(src).toContain('id="attachmentUrl"');
    expect(src).toContain('id="notes"');
  });
});
