import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) =>
    createElement('a', { href, ...props }, children),
}));

let mockNavMode = 'mobile';

vi.mock('@/hooks/use-responsive-nav', () => ({
  useResponsiveNav: () => ({
    navMode: mockNavMode,
    isMobile: mockNavMode === 'mobile',
    isTablet: mockNavMode === 'tablet',
    isDesktop: mockNavMode === 'desktop',
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({
    isLoaded: true,
    isSuperAdmin: true,
    isCoordinator: false,
    isOps: false,
    isReadOnly: false,
  }),
}));

import { MoreMenuClient } from './more-menu-client';

function render() {
  return renderToStaticMarkup(createElement(MoreMenuClient));
}

describe('MoreMenuClient responsive migration', () => {
  beforeEach(() => {
    mockNavMode = 'mobile';
  });

  it('renders menu items on mobile', () => {
    mockNavMode = 'mobile';
    const html = render();
    expect(html).toContain('Travel');
    expect(html).toContain('More');
  });

  it('returns null on desktop (hidden — sidebar handles navigation)', () => {
    mockNavMode = 'desktop';
    const html = render();
    expect(html).toBe('');
  });

  it('renders on tablet', () => {
    mockNavMode = 'tablet';
    const html = render();
    expect(html).toContain('More');
  });
});
