import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('lucide-react', () => ({
  X: () => null,
  User: () => null,
}));

vi.mock('@/lib/actions/speaker-profile', () => ({}));

import { SpeakerProfileOverlay } from './speaker-profile-overlay';
import type { PublicSpeaker } from '@/lib/actions/speaker-profile';

const mockSpeaker: PublicSpeaker = {
  personId: 'p1',
  fullName: 'Dr. Priya Sharma',
  designation: 'Head of Cardiology',
  organization: 'AIIMS New Delhi',
  bio: 'A leading interventional cardiologist with over 20 years of experience.',
  photoStorageKey: null,
  sessions: [
    {
      sessionId: 's1',
      title: 'Advances in Minimally Invasive Cardiac Surgery',
      sessionDate: new Date('2026-05-01T00:00:00Z'),
      startAtUtc: new Date('2026-05-01T04:30:00Z'),
      endAtUtc: new Date('2026-05-01T06:00:00Z'),
      hallName: 'Hall A',
      role: 'Chairperson',
    },
  ],
};

function render(speaker: PublicSpeaker | null, onClose = vi.fn()) {
  return renderToStaticMarkup(
    createElement(SpeakerProfileOverlay, { speaker, onClose }),
  );
}

describe('SpeakerProfileOverlay', () => {
  it('renders nothing when speaker is null', () => {
    const html = render(null);
    expect(html).toBe('');
  });

  it('renders speaker name', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('Dr. Priya Sharma');
    expect(html).toContain('data-testid="speaker-name"');
  });

  it('renders designation when present', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('Head of Cardiology');
    expect(html).toContain('data-testid="speaker-designation"');
  });

  it('renders organization when present', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('AIIMS New Delhi');
    expect(html).toContain('data-testid="speaker-organization"');
  });

  it('renders bio section when bio is present', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('data-testid="speaker-bio-section"');
    expect(html).toContain('A leading interventional cardiologist');
    expect(html).toContain('About');
  });

  it('omits bio section when bio is null', () => {
    const noBio = { ...mockSpeaker, bio: null };
    const html = render(noBio);
    expect(html).not.toContain('data-testid="speaker-bio-section"');
  });

  it('renders sessions section with correct title', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('Sessions at this event');
    expect(html).toContain('data-testid="speaker-sessions-section"');
  });

  it('renders a session card for each session', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('data-testid="speaker-session-card"');
    expect(html).toContain('Advances in Minimally Invasive Cardiac Surgery');
  });

  it('renders the role badge on each session card', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('data-testid="speaker-session-role"');
    expect(html).toContain('Chairperson');
  });

  it('renders hall name in session meta', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('Hall A');
  });

  it('omits sessions section when speaker has no sessions', () => {
    const noSessions = { ...mockSpeaker, sessions: [] };
    const html = render(noSessions);
    expect(html).not.toContain('data-testid="speaker-sessions-section"');
  });

  it('renders close button', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('data-testid="speaker-overlay-close"');
  });

  it('renders backdrop element', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('data-testid="speaker-overlay-backdrop"');
  });

  it('renders dialog with role and aria-modal attributes', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it('renders mobile bottom-sheet positioning classes', () => {
    const html = render(mockSpeaker);
    // Mobile: bottom-0, left-0, right-0, rounded-t-2xl
    expect(html).toContain('bottom-0');
    expect(html).toContain('rounded-t-2xl');
  });

  it('renders desktop modal positioning classes', () => {
    const html = render(mockSpeaker);
    // Desktop: md:w-[640px], md:rounded-2xl, md:-translate-x-1/2
    expect(html).toContain('md:w-[640px]');
    expect(html).toContain('md:rounded-2xl');
  });

  it('renders two-column grid on desktop', () => {
    const html = render(mockSpeaker);
    expect(html).toContain('md:grid-cols-[200px_1fr]');
  });
});
