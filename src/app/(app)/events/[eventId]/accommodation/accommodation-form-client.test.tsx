import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/actions/accommodation', () => ({
  createAccommodationRecord: vi.fn(),
  updateAccommodationRecord: vi.fn(),
}));

import { AccommodationFormClient } from './accommodation-form-client';

const defaultProps = {
  eventId: 'evt-1',
  peopleWithTravel: [
    { personId: 'p1', personName: 'Alice', personEmail: 'alice@test.com', personPhone: null },
  ],
};

describe('AccommodationFormClient responsive layout', () => {
  it('uses FormGrid with responsive grid classes', () => {
    const html = renderToStaticMarkup(createElement(AccommodationFormClient, defaultProps));
    // Should have mobile-first single column that expands to 2-col on md
    expect(html).toContain('grid-cols-1');
    expect(html).toContain('md:grid-cols-2');
  });

  it('renders person and hotel fields', () => {
    const html = renderToStaticMarkup(createElement(AccommodationFormClient, defaultProps));
    expect(html).toContain('hotelName');
    expect(html).toContain('personId');
  });

  it('renders check-in and check-out date fields', () => {
    const html = renderToStaticMarkup(createElement(AccommodationFormClient, defaultProps));
    expect(html).toContain('checkInDate');
    expect(html).toContain('checkOutDate');
  });

  it('renders room type and room number fields', () => {
    const html = renderToStaticMarkup(createElement(AccommodationFormClient, defaultProps));
    expect(html).toContain('roomType');
    expect(html).toContain('roomNumber');
  });

  it('renders special requests and notes as full-width fields', () => {
    const html = renderToStaticMarkup(createElement(AccommodationFormClient, defaultProps));
    expect(html).toContain('specialRequests');
    expect(html).toContain('notes');
    // These should span full width
    expect(html).toContain('col-span-full');
  });

  it('does not use hardcoded grid-cols-2 (old non-responsive pattern)', () => {
    const html = renderToStaticMarkup(createElement(AccommodationFormClient, defaultProps));
    // Should NOT have the old non-responsive 2-col grid
    // The only grid-cols-2 allowed is behind md: prefix
    const nonResponsivePattern = /class="[^"]*(?<!md:)grid-cols-2/;
    expect(nonResponsivePattern.test(html)).toBe(false);
  });
});
