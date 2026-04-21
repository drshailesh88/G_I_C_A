import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------- Mocks (must be before component import) ----------

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}));

// Mock next/link — render as <a>
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { publicMetadata: { appRole: 'super_admin' } },
    isLoaded: true,
  }),
  UserButton: () => createElement('div', { 'data-testid': 'clerk-user-button' }, 'UserButton'),
}));

// Mock useResponsiveNav
type NavMode = 'mobile' | 'tablet' | 'desktop';
const mockUseResponsiveNav = vi.fn((): {
  navMode: NavMode;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
} => ({
  navMode: 'desktop',
  isSidebarOpen: true,
  toggleSidebar: vi.fn(),
  closeSidebar: vi.fn(),
}));

vi.mock('@/hooks/use-responsive-nav', () => ({
  useResponsiveNav: () => mockUseResponsiveNav(),
}));

// Mock useRole
let mockRoleState = {
  isLoaded: true,
  isSuperAdmin: true,
  isCoordinator: false,
  isOps: false,
  isReadOnly: false,
  canWrite: true,
};

vi.mock('@/hooks/use-role', () => ({
  useRole: () => mockRoleState,
}));

import { usePathname } from 'next/navigation';

// Import after mocks
import { AppSidebar } from './sidebar';

function render(props?: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(AppSidebar, props));
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/dashboard');
    mockRoleState = {
      isLoaded: true,
      isSuperAdmin: true,
      isCoordinator: false,
      isOps: false,
      isReadOnly: false,
      canWrite: true,
    };
    mockUseResponsiveNav.mockReturnValue({
      navMode: 'desktop',
      isSidebarOpen: true,
      toggleSidebar: vi.fn(),
      closeSidebar: vi.fn(),
    });
  });

  // --- Desktop rendering ---

  it('renders sidebar with 256px width on desktop (w-64)', () => {
    const html = render();
    expect(html).toContain('w-64');
  });

  it('renders all main navigation items', () => {
    const html = render();
    expect(html).toContain('Dashboard');
    expect(html).toContain('/dashboard');
    expect(html).toContain('Events');
    expect(html).toContain('/events');
    expect(html).toContain('People');
    expect(html).toContain('/people');
    expect(html).toContain('Program');
    expect(html).toContain('/program');
  });

  it('filters coordinator-restricted main tabs for Ops users', () => {
    mockRoleState = {
      isLoaded: true,
      isSuperAdmin: false,
      isCoordinator: false,
      isOps: true,
      isReadOnly: false,
      canWrite: true,
    };

    const html = render();
    expect(html).toContain('Dashboard');
    expect(html).not.toContain('People');
    expect(html).not.toContain('Program');
    expect(html).not.toContain('/events');
  });

  it('renders Settings section with Team link', () => {
    const html = render();
    expect(html).toContain('Team');
    expect(html).toContain('/settings/team');
  });

  it('highlights active nav item based on pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/events');
    const html = render();
    // The Events link should have active styling
    expect(html).toContain('data-active="true"');
  });

  it('highlights Dashboard only on exact /dashboard match', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard');
    const html = render();
    // Should have active indicator
    expect(html).toContain('data-active="true"');
  });

  it('renders Clerk UserButton at bottom', () => {
    const html = render();
    expect(html).toContain('UserButton');
  });

  it('renders collapse toggle button', () => {
    const html = render();
    expect(html).toContain('Toggle sidebar');
  });

  // --- Tablet rendering ---

  it('renders 64px icon-only rail on tablet (w-16)', () => {
    mockUseResponsiveNav.mockReturnValue({
      navMode: 'tablet',
      isSidebarOpen: false,
      toggleSidebar: vi.fn(),
      closeSidebar: vi.fn(),
    });
    const html = render();
    expect(html).toContain('w-16');
  });

  // --- Mobile rendering ---

  it('returns null on mobile', () => {
    mockUseResponsiveNav.mockReturnValue({
      navMode: 'mobile',
      isSidebarOpen: false,
      toggleSidebar: vi.fn(),
      closeSidebar: vi.fn(),
    });
    const html = render();
    expect(html).toBe('');
  });

  // --- Event Tools section ---

  it('does NOT render Event Tools when NOT inside an event', () => {
    vi.mocked(usePathname).mockReturnValue('/events');
    const html = render();
    expect(html).not.toContain('Event Tools');
    expect(html).not.toContain('Registrations');
    expect(html).not.toContain('Sessions');
  });

  it('renders Event Tools section when inside /events/[eventId]/*', () => {
    vi.mocked(usePathname).mockReturnValue('/events/evt_123/registrations');
    const html = render();
    expect(html).toContain('Event Tools');
    expect(html).toContain('Registrations');
    expect(html).toContain('Sessions');
    expect(html).toContain('Schedule');
    expect(html).toContain('Travel');
    expect(html).toContain('Accommodation');
    expect(html).toContain('Transport');
    expect(html).toContain('Communications');
    expect(html).toContain('Certificates');
    expect(html).toContain('QR Check-in');
    expect(html).toContain('Reports');
    expect(html).toContain('Branding');
    expect(html).toContain('Flags');
  });

  it('hides privileged event tools from Ops users', () => {
    vi.mocked(usePathname).mockReturnValue('/events/evt_123/travel');
    mockRoleState = {
      isLoaded: true,
      isSuperAdmin: false,
      isCoordinator: false,
      isOps: true,
      isReadOnly: false,
      canWrite: true,
    };

    const html = render();
    expect(html).toContain('Travel');
    expect(html).toContain('Accommodation');
    expect(html).toContain('Transport');
    expect(html).not.toContain('Registrations');
    expect(html).not.toContain('Communications');
    expect(html).not.toContain('Certificates');
    expect(html).not.toContain('Flags');
    expect(html).not.toContain('/settings/team');
  });

  it('builds Event Tools hrefs with the current eventId', () => {
    vi.mocked(usePathname).mockReturnValue('/events/evt_456/travel');
    const html = render();
    expect(html).toContain('/events/evt_456/registrations');
    expect(html).toContain('/events/evt_456/sessions');
    expect(html).toContain('/events/evt_456/travel');
  });

  // --- Section labels ---

  it('renders section group labels', () => {
    vi.mocked(usePathname).mockReturnValue('/events/evt_1/registrations');
    const html = render();
    expect(html).toContain('Main');
    expect(html).toContain('Event Tools');
    expect(html).toContain('Settings');
  });
});
