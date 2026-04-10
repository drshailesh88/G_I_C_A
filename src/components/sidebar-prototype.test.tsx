import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ──

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => createElement('div', { 'data-testid': 'clerk-user-button' }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({
    isLoaded: true,
    isSuperAdmin: true,
    isCoordinator: false,
    isOps: false,
    isReadOnly: false,
    canWrite: true,
  }),
}));

import { SidebarPrototype } from './sidebar-prototype';
import { SidebarProvider } from '@/components/ui/sidebar';

function render() {
  return renderToStaticMarkup(
    createElement(SidebarProvider, null, createElement(SidebarPrototype)),
  );
}

describe('SidebarPrototype', () => {
  it('renders a sidebar element with test id', () => {
    const html = render();
    expect(html).toContain('data-testid="app-sidebar"');
  });

  it('renders navigation links', () => {
    const html = render();
    expect(html).toContain('Dashboard');
    expect(html).toContain('Events');
    expect(html).toContain('People');
    expect(html).toContain('Program');
  });

  it('renders Clerk UserButton inside sidebar', () => {
    const html = render();
    expect(html).toContain('data-testid="clerk-user-button"');
  });

  it('renders navigation icons from lucide-react', () => {
    const html = render();
    // Links should have href attributes
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/events"');
    expect(html).toContain('href="/people"');
    expect(html).toContain('href="/program"');
  });

  it('highlights the active route', () => {
    const html = render();
    // The active link (/dashboard) should have data-active="true" and active styles
    expect(html).toContain('data-active="true"');
    expect(html).toContain('bg-accent-light');
  });
});
