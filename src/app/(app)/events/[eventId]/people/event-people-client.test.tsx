import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventPeopleClient } from './event-people-client';

function render(props: Parameters<typeof EventPeopleClient>[0]) {
  return renderToStaticMarkup(createElement(EventPeopleClient, props));
}

describe('EventPeopleClient', () => {
  it('renders People heading with heading role', () => {
    const html = render({ eventId: 'evt-1', people: [] });
    expect(html).toContain('<h1 role="heading">People</h1>');
  });

  it('renders delegate cards for each person', () => {
    const people = [
      { id: 'p1', fullName: 'Dr. Rajesh', email: 'raj@example.com', phoneE164: '+919876543210' },
      { id: 'p2', fullName: 'Prof. Anita', email: null, phoneE164: null },
    ];
    const html = render({ eventId: 'evt-1', people });
    expect(html).toContain('Dr. Rajesh');
    expect(html).toContain('Prof. Anita');
    expect(html).toContain('raj@example.com');
    expect(html).toContain('+919876543210');
  });

  it('shows empty state when no people', () => {
    const html = render({ eventId: 'evt-1', people: [] });
    expect(html).toContain('No people linked to this event yet.');
  });
});
