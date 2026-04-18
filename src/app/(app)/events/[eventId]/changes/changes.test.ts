import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/actions/program', () => ({
  getVersionPreviewData: vi.fn(),
  getVersionEmailParts: vi.fn(),
  sendVersionEmails: vi.fn(),
}));

import { ChangesClient } from './changes-client';

const componentSource = fs.readFileSync(
  new URL('./changes-client.tsx', import.meta.url),
  'utf8',
);

const EVENT_ID = 'event-abc-123';

const baseVersion: {
  id: string;
  versionNo: number;
  publishedAt: Date;
  publishedBy: string;
  changesSummaryJson: unknown;
  changesDescription: string | null;
  publishReason: string | null;
  affectedPersonIdsJson: unknown;
} = {
  id: 'ver-001',
  versionNo: 1,
  publishedAt: new Date('2026-04-01T10:00:00Z'),
  publishedBy: 'user_clerk_abc',
  changesSummaryJson: {
    added_sessions: ['s1', 's2'],
    removed_sessions: ['s3'],
    total_sessions: 10,
    total_assignments: 25,
  },
  changesDescription: 'Updated panel schedule',
  publishReason: 'Final confirmed schedule',
  affectedPersonIdsJson: [],
};

type TestVersion = typeof baseVersion;
function render(versions: TestVersion[] = []) {
  return renderToStaticMarkup(
    createElement(ChangesClient, { eventId: EVENT_ID, versions }),
  );
}

describe('ChangesClient — PKT-A-010 version history page', () => {
  it('renders empty state when no versions exist', () => {
    const html = render([]);
    expect(html).toContain('data-testid="empty-state"');
    expect(html).toContain('No versions published yet');
  });

  it('does not render versions-list in empty state', () => {
    const html = render([]);
    expect(html).not.toContain('data-testid="versions-list"');
  });

  it('renders versions-list when versions are present', () => {
    const html = render([baseVersion]);
    expect(html).toContain('data-testid="versions-list"');
    expect(html).not.toContain('data-testid="empty-state"');
  });

  it('renders a card for each version', () => {
    const v2 = { ...baseVersion, id: 'ver-002', versionNo: 2 };
    const html = render([baseVersion, v2]);
    const cards = html.match(/data-testid="version-card"/g);
    expect(cards).toHaveLength(2);
  });

  it('displays the version number for each version', () => {
    const html = render([baseVersion]);
    expect(html).toContain('Version 1');
  });

  it('renders published-by metadata for each version', () => {
    const html = render([baseVersion]);
    expect(html).toContain('data-testid="published-by"');
    expect(html).toContain('user_clerk_abc');
  });

  it('renders the changes-summary section with correct added count', () => {
    const html = render([baseVersion]);
    // added_sessions has 2 IDs → count 2
    expect(html).toContain('data-testid="added-count"');
    expect(html).toMatch(/data-testid="added-count"[^>]*>2<\//);
  });

  it('renders removed sessions count correctly', () => {
    const html = render([baseVersion]);
    expect(html).toMatch(/data-testid="removed-count"[^>]*>1<\//);
  });

  it('renders total sessions count', () => {
    const html = render([baseVersion]);
    expect(html).toMatch(/data-testid="total-sessions"[^>]*>10<\//);
  });

  it('renders total assignments count', () => {
    const html = render([baseVersion]);
    expect(html).toMatch(/data-testid="total-assignments"[^>]*>25<\//);
  });

  it('renders changesDescription when present', () => {
    const html = render([baseVersion]);
    expect(html).toContain('Updated panel schedule');
  });

  it('renders publishReason when present', () => {
    const html = render([baseVersion]);
    expect(html).toContain('Final confirmed schedule');
  });

  it('omits publishReason section when null', () => {
    const v = { ...baseVersion, publishReason: null };
    const html = render([v]);
    expect(html).not.toContain('data-testid="publish-reason"');
  });

  it('omits changesDescription section when null', () => {
    const v = { ...baseVersion, changesDescription: null };
    const html = render([v]);
    expect(html).not.toContain('data-testid="changes-description"');
  });

  it('renders gracefully when changesSummaryJson is null', () => {
    const v = { ...baseVersion, changesSummaryJson: null };
    const html = render([v]);
    expect(html).toContain('data-testid="version-card"');
    expect(html).not.toContain('data-testid="changes-summary"');
  });

  it('displays timestamp in IST locale', () => {
    // The component uses toLocaleString with Asia/Kolkata
    expect(componentSource).toContain("timeZone: 'Asia/Kolkata'");
  });

  it('back link points to the event workspace', () => {
    const html = render([baseVersion]);
    expect(html).toContain(`/events/${EVENT_ID}`);
  });
});
