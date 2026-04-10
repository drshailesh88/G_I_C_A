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

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Events', href: '/events', icon: Calendar },
  { label: 'People', href: '/people', icon: Users },
  { label: 'Program', href: '/program', icon: Grid3X3 },
];

const EVENT_TOOLS: NavItem[] = [
  { label: 'Registrations', href: 'registrations', icon: ClipboardList },
  { label: 'Sessions', href: 'sessions', icon: Presentation },
  { label: 'Schedule', href: 'schedule', icon: CalendarDays },
  { label: 'Travel', href: 'travel', icon: Plane },
  { label: 'Accommodation', href: 'accommodation', icon: Hotel },
  { label: 'Transport', href: 'transport', icon: Bus },
  { label: 'Communications', href: 'communications/failed', icon: Mail },
  { label: 'Certificates', href: 'certificates', icon: Award },
  { label: 'QR Check-in', href: 'qr', icon: QrCode },
  { label: 'Reports', href: 'reports', icon: FileText },
  { label: 'Branding', href: 'branding', icon: Palette },
  { label: 'Flags', href: 'flags', icon: Flag },
];

const SETTINGS_NAV: NavItem[] = [
  { label: 'Team', href: '/settings/team', icon: Settings },
];

function extractEventId(pathname: string): string | null {
  const match = pathname.match(/^\/events\/([^/]+)\/.+/);
  return match ? match[1] : null;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { navMode, isSidebarOpen, toggleSidebar, closeSidebar } = useResponsiveNav();

  if (navMode === 'mobile') return null;

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
              {MAIN_NAV.map((item) => (
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
                {EVENT_TOOLS.map((item) => {
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
              {SETTINGS_NAV.map((item) => (
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
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-2 px-2')}>
            <UserButton />
          </div>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}
