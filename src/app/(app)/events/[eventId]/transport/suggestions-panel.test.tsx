import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/lib/actions/transport', () => ({
  refreshTransportSuggestions: vi.fn(),
  acceptSuggestion: vi.fn(),
  discardSuggestion: vi.fn(),
  mergeSuggestions: vi.fn(),
  splitSuggestion: vi.fn(),
}));

import { SuggestionsPanel } from './suggestions-panel';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeSuggestion(overrides: Partial<Parameters<typeof SuggestionsPanel>[0]['suggestions'][number]> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    eventId: EVENT_ID,
    movementType: 'arrival',
    serviceDate: new Date('2026-05-01T00:00:00Z'),
    timeWindowStart: new Date('2026-05-01T06:00:00Z'),
    timeWindowEnd: new Date('2026-05-01T09:00:00Z'),
    sourceCity: 'Mumbai',
    pickupHub: 'BOM T2',
    dropHub: 'Event Venue',
    batchStatus: 'planned',
    batchSource: 'auto',
    passengers: [
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        personId: '550e8400-e29b-41d4-a716-446655440020',
        travelRecordId: '550e8400-e29b-41d4-a716-446655440030',
        personName: 'Dr One',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        personId: '550e8400-e29b-41d4-a716-446655440021',
        travelRecordId: '550e8400-e29b-41d4-a716-446655440031',
        personName: 'Dr Two',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440012',
        personId: '550e8400-e29b-41d4-a716-446655440022',
        travelRecordId: '550e8400-e29b-41d4-a716-446655440032',
        personName: 'Dr Three',
      },
    ],
    ...overrides,
  };
}

function render(suggestions = [makeSuggestion()]) {
  return renderToStaticMarkup(
    createElement(SuggestionsPanel, {
      eventId: EVENT_ID,
      suggestions,
    }),
  );
}

describe('SuggestionsPanel', () => {
  it('returns an empty string when suggestions is empty', () => {
    expect(render([])).toBe('');
  });

  it('renders data-testid suggestions-panel with one suggestion', () => {
    expect(render()).toContain('data-testid="suggestions-panel"');
  });

  it('renders Suggested Batches text', () => {
    expect(render()).toContain('Suggested Batches');
  });

  it('renders the count badge with the correct number', () => {
    const html = render([
      makeSuggestion(),
      makeSuggestion({ id: '550e8400-e29b-41d4-a716-446655440099' }),
    ]);
    expect(html).toContain('>2<');
  });

  it('renders a suggestion-card for each suggestion', () => {
    const html = render([
      makeSuggestion(),
      makeSuggestion({ id: '550e8400-e29b-41d4-a716-446655440099' }),
    ]);
    expect(html.match(/data-testid="suggestion-card"/g)).toHaveLength(2);
  });

  it('renders the route with pickupHub and dropHub text', () => {
    const html = render();
    expect(html).toContain('BOM T2');
    expect(html).toContain('Event Venue');
  });

  it('renders Arrival or Departure text in the badge', () => {
    expect(render()).toContain('Arrival');
  });

  it('renders the passenger count', () => {
    expect(render()).toContain('>3<');
  });

  it('contains Accept button text', () => {
    expect(render()).toContain('Accept');
  });

  it('contains a Discard button', () => {
    expect(render()).toContain('Discard');
  });

  it('renders a disabled Merge button when there is only one suggestion', () => {
    const html = render([makeSuggestion()]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Merge<\/button>/);
  });

  it('renders a disabled Split button when passenger count is less than 2', () => {
    const html = render([
      makeSuggestion({
        passengers: [
          {
            id: '550e8400-e29b-41d4-a716-446655440010',
            personId: '550e8400-e29b-41d4-a716-446655440020',
            travelRecordId: '550e8400-e29b-41d4-a716-446655440030',
            personName: 'Solo Passenger',
          },
        ],
      }),
    ]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Split<\/button>/);
  });
});
