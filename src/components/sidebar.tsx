'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  Bus,
  Calendar,
  CalendarDays,
  ClipboardList,
  FileText,
  Flag,
  Grid3X3,
  Hotel,
  LayoutDashboard,
  Mail,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Presentation,
  QrCode,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';
import { useRole } from '@/hooks/use-role';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { ROLES } from '@/lib/auth/roles';

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
};

const MAIN_NAV: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS, ROLES.READ_ONLY],
  },
  {
    label: 'Events',
    href: '/events',
    icon: Calendar,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'People',
    href: '/people',
    icon: Users,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'Program',
    href: '/program',
    icon: Grid3X3,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
];

const EVENT_TOOLS: NavItem[] = [
  {
    label: 'Registrations',
    href: 'registrations',
    icon: ClipboardList,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'Sessions',
    href: 'sessions',
    icon: Presentation,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'Schedule',
    href: 'schedule',
    icon: CalendarDays,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'Travel',
    href: 'travel',
    icon: Plane,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS, ROLES.READ_ONLY],
  },
  {
    label: 'Accommodation',
    href: 'accommodation',
    icon: Hotel,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS, ROLES.READ_ONLY],
  },
  {
    label: 'Transport',
    href: 'transport',
    icon: Bus,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS, ROLES.READ_ONLY],
  },
  {
    label: 'Communications',
    href: 'communications/failed',
    icon: Mail,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'Certificates',
    href: 'certificates',
    icon: Award,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'QR Check-in',
    href: 'qr',
    icon: QrCode,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'Reports',
    href: 'reports',
    icon: FileText,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  {
    label: 'Branding',
    href: 'branding',
    icon: Palette,
    roles: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  },
  { label: 'Flags', href: 'flags', icon: Flag, roles: [ROLES.SUPER_ADMIN] },
];

const SETTINGS_NAV: NavItem[] = [
  { label: 'Team', href: '/settings/team', icon: Settings, roles: [ROLES.SUPER_ADMIN] },
];

function extractEventId(pathname: string): string | null {
  const match = pathname.match(/^\/events\/([^/]+)\/.+/);
  return match ? match[1] : null;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/events') return pathname === '/events';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { navMode, isSidebarOpen, toggleSidebar, closeSidebar } = useResponsiveNav();
  const { isLoaded, isSuperAdmin, isCoordinator, isOps, isReadOnly } = useRole();

  if (navMode === 'mobile') return null;

  const userRole = isSuperAdmin
    ? ROLES.SUPER_ADMIN
    : isCoordinator
      ? ROLES.EVENT_COORDINATOR
      : isOps
        ? ROLES.OPS
        : isReadOnly
          ? ROLES.READ_ONLY
          : null;

  if (!isLoaded || !userRole) return null;

  const eventId = extractEventId(pathname);
  const collapsed = navMode === 'tablet' && !isSidebarOpen;

  function handleNavClick() {
    if (navMode === 'tablet') {
      closeSidebar();
    }
  }

  return (
    <SidebarProvider collapsed={collapsed}>
      <Sidebar collapsed={collapsed}>
        <SidebarHeader>
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-md p-1.5 text-text-muted hover:bg-border/30 hover:text-text-primary"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Main</SidebarGroupLabel>}
            <SidebarMenu>
              {MAIN_NAV.filter((item) => item.roles.includes(userRole)).map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={item.label}>
                    <Link href={item.href} onClick={handleNavClick}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {eventId && (
            <SidebarGroup>
              {!collapsed && <SidebarGroupLabel>Event Tools</SidebarGroupLabel>}
              <SidebarMenu>
                {EVENT_TOOLS.filter((item) => item.roles.includes(userRole)).map((item) => {
                  const href = `/events/${eventId}/${item.href}`;
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton asChild isActive={isActive(pathname, href)} tooltip={item.label}>
                        <Link href={href} onClick={handleNavClick}>
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>{item.label}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          )}

          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Settings</SidebarGroupLabel>}
            <SidebarMenu>
              {SETTINGS_NAV.filter((item) => item.roles.includes(userRole)).map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={item.label}>
                    <Link href={item.href} onClick={handleNavClick}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-2 px-2')}>
            <UserButton />
          </div>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}
