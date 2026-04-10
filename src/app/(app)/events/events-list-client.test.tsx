import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) =>
    createElement('a', { href, ...props }, children),
}));

import { EventsListClient } from './events-list-client';

const EVENTS = [
  {
    id: 'e1',
    name: 'GEM 2026',
    status: 'published',
    startDate: new Date('2027-05-15'),
    endDate: new Date('2027-05-17'),
    venueName: 'Convention Center',
    venueCity: 'Mumbai',
  },
  {
    id: 'e2',
    name: 'Workshop',
    status: 'completed',
    startDate: new Date('2025-01-10'),
    endDate: new Date('2025-01-10'),
    venueName: null,
    venueCity: null,
  },
];

function render(events = EVENTS) {
  return renderToStaticMarkup(createElement(EventsListClient, { events }));
}

describe('EventsListClient responsive migration', () => {
  it('renders event cards with ResponsiveMetricGrid (auto-fit grid)', () => {
    const html = render();
    // Should use CSS grid with auto-fit for card layout
    expect(html).toContain('repeat(auto-fit');
    expect(html).toContain('280px');
  });

  it('uses fluid spacing tokens', () => {
    const html = render();
    expect(html).toContain('var(--space-');
  });

  it('uses fluid font-size tokens', () => {
    const html = render();
    expect(html).toContain('var(--font-size-');
  });

  it('still renders event data correctly', () => {
    const html = render();
    expect(html).toContain('GEM 2026');
    expect(html).toContain('Convention Center, Mumbai');
  });

  it('renders empty state when no events', () => {
    const html = render([]);
    expect(html).toContain('No events yet');
  });
});
