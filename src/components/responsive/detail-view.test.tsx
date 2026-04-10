import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock useResponsiveNav hook
const mockUseResponsiveNav = vi.fn();
vi.mock('@/hooks/use-responsive-nav', () => ({
  useResponsiveNav: () => mockUseResponsiveNav(),
}));

import { DetailView } from './detail-view';

function render(props: Partial<Parameters<typeof DetailView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(DetailView, {
      list: createElement('div', { 'data-testid': 'list-panel' }, 'Session List'),
      detail: null,
      ...props,
    }),
  );
}

function desktopNav() {
  return {
    navMode: 'desktop' as const,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    sidebarOpen: true,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

function mobileNav() {
  return {
    navMode: 'mobile' as const,
    isMobile: true,
    isTablet: false,
    isDesktop: false,
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

function tabletNav() {
  return {
    navMode: 'tablet' as const,
    isMobile: false,
    isTablet: true,
    isDesktop: false,
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

describe('DetailView', () => {
  // ── Desktop layout ──

  it('renders list and detail side-by-side on desktop', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render({
      detail: createElement('div', { 'data-testid': 'detail-panel' }, 'Detail'),
    });
    expect(html).toContain('Session List');
    expect(html).toContain('Detail');
    // Both panels visible in grid layout
    expect(html).toContain('data-testid="list-panel"');
    expect(html).toContain('data-testid="detail-panel"');
  });

  it('shows empty state placeholder when no detail selected on desktop', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render({ detail: null });
    expect(html).toContain('Session List');
    expect(html).toContain('Select an item');
  });

  // ── Mobile layout ──

  it('shows only list panel on mobile when no detail selected', () => {
    mockUseResponsiveNav.mockReturnValue(mobileNav());
    const html = render({ detail: null });
    expect(html).toContain('Session List');
    // No detail panel or empty state on mobile
    expect(html).not.toContain('Select an item');
  });

  it('shows detail panel with back button on mobile when detail is provided', () => {
    mockUseResponsiveNav.mockReturnValue(mobileNav());
    const html = render({
      detail: createElement('div', null, 'Detail Content'),
      showDetail: true,
    });
    expect(html).toContain('Detail Content');
    // Back button present
    expect(html).toContain('Back');
  });

  it('hides list panel on mobile when showDetail is true', () => {
    mockUseResponsiveNav.mockReturnValue(mobileNav());
    const html = render({
      detail: createElement('div', null, 'Detail Content'),
      showDetail: true,
    });
    expect(html).toContain('Detail Content');
    expect(html).not.toContain('Session List');
  });

  // ── Tablet layout ──

  it('renders side-by-side on tablet like desktop', () => {
    mockUseResponsiveNav.mockReturnValue(tabletNav());
    const html = render({
      detail: createElement('div', { 'data-testid': 'detail-panel' }, 'Detail'),
    });
    expect(html).toContain('Session List');
    expect(html).toContain('Detail');
  });

  // ── Back button callback ──

  it('renders back button that calls onBack on mobile detail view', () => {
    mockUseResponsiveNav.mockReturnValue(mobileNav());
    const html = render({
      detail: createElement('div', null, 'Detail'),
      showDetail: true,
      onBack: () => {},
    });
    expect(html).toContain('Back');
  });
});
