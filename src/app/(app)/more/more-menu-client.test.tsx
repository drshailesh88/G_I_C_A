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

let mockRoleState = {
  isSuperAdmin: true,
  isCoordinator: false,
  isOps: false,
  isReadOnly: false,
};

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({
    isLoaded: true,
    ...mockRoleState,
  }),
}));

import { MoreMenuClient } from './more-menu-client';

function render() {
  return renderToStaticMarkup(createElement(MoreMenuClient));
}

describe('MoreMenuClient responsive migration', () => {
  beforeEach(() => {
    mockNavMode = 'mobile';
    mockRoleState = {
      isSuperAdmin: true,
      isCoordinator: false,
      isOps: false,
      isReadOnly: false,
    };
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

// ── PKT-B-005 acceptance: cross-event Reports nav is super-admin only ──

describe('MoreMenuClient — Reports nav RBAC (PKT-B-005)', () => {
  beforeEach(() => {
    mockNavMode = 'mobile';
  });

  it('shows the Reports item to Super Admin', () => {
    mockRoleState = { isSuperAdmin: true, isCoordinator: false, isOps: false, isReadOnly: false };
    const html = render();
    expect(html).toMatch(/href="\/reports"/);
  });

  it('hides the Reports item from Event Coordinator', () => {
    mockRoleState = { isSuperAdmin: false, isCoordinator: true, isOps: false, isReadOnly: false };
    const html = render();
    expect(html).not.toMatch(/href="\/reports"/);
  });

  it('hides the Reports item from Read-only', () => {
    mockRoleState = { isSuperAdmin: false, isCoordinator: false, isOps: false, isReadOnly: true };
    const html = render();
    expect(html).not.toMatch(/href="\/reports"/);
  });

  it('hides the Reports item from Ops', () => {
    mockRoleState = { isSuperAdmin: false, isCoordinator: false, isOps: true, isReadOnly: false };
    const html = render();
    expect(html).not.toMatch(/href="\/reports"/);
  });
});
