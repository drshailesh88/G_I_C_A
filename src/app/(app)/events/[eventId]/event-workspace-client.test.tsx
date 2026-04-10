import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/actions/event', () => ({
  updateEventStatus: vi.fn(),
}));
vi.mock('@/lib/validations/event', () => ({
  EVENT_TRANSITIONS: { draft: ['published', 'cancelled'] },
}));

import { EventWorkspaceClient } from './event-workspace-client';

const componentSource = fs.readFileSync(
  new URL('./event-workspace-client.tsx', import.meta.url),
  'utf8',
);

const baseEvent = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Conference',
  status: 'draft',
  startDate: new Date('2026-03-01'),
  endDate: new Date('2026-03-03'),
  venueName: 'Convention Center',
  moduleToggles: {},
};

function render(overrides: Partial<typeof baseEvent> = {}) {
  return renderToStaticMarkup(
    createElement(EventWorkspaceClient, { event: { ...baseEvent, ...overrides } }),
  );
}

describe('EventWorkspaceClient — responsive migration (DRS-25)', () => {
  // ── Source-level checks ──────────────────────────────────────────

  it('imports ResponsiveMetricGrid', () => {
    expect(componentSource).toContain("from '@/components/responsive/responsive-metric-grid'");
  });

  it('uses ResponsiveMetricGrid for module tiles with minCardWidth={180}', () => {
    expect(componentSource).toMatch(/ResponsiveMetricGrid[\s\S]*?minCardWidth=\{180\}/);
  });

  it('does not use hardcoded grid-cols-2 for module tiles', () => {
    // The old hardcoded grid-cols-2 on the module tiles should be removed
    expect(componentSource).not.toContain('grid-cols-2');
  });

  // ── Render checks ───────────────────────────────────────────────

  it('renders module navigation cards inside a grid container', () => {
    const html = render();
    // ResponsiveMetricGrid renders a div with grid style
    expect(html).toContain('grid-template-columns');
    expect(html).toContain('auto-fit');
  });

  it('renders module tiles with minCardWidth 180px', () => {
    const html = render();
    expect(html).toContain('180px');
  });

  it('renders all default module tiles', () => {
    const html = render();
    expect(html).toContain('Sessions');
    expect(html).toContain('Schedule Grid');
    expect(html).toContain('Templates');
    expect(html).toContain('Travel');
    expect(html).toContain('Certificates');
  });

  it('hides module tiles when toggled off', () => {
    const html = render({ moduleToggles: { certificates: false } as unknown });
    expect(html).not.toContain('Certificates');
    expect(html).toContain('Sessions');
  });

  it('renders event info banner', () => {
    const html = render();
    expect(html).toContain('Test Conference');
    expect(html).toContain('Convention Center');
  });

  // ── No horizontal overflow at 375px (structural check) ─────────

  it('uses fluid min(100%, ...) pattern to prevent overflow on small screens', () => {
    const html = render();
    // The RAM pattern uses min(100%, Npx) which prevents overflow
    expect(html).toContain('min(100%');
  });
});
