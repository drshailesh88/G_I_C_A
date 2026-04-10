'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  Users,
  Presentation,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { ROLES, TAB_ACCESS } from '@/lib/auth/roles';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';
import { shouldShowTabBar, isResponsiveShellEnabled } from '@/components/app-shell';

const tabs = [
  { key: 'HOME', label: 'Home', href: '/dashboard', icon: Home },
  { key: 'EVENTS', label: 'Events', href: '/events', icon: Calendar },
  { key: 'PEOPLE', label: 'People', href: '/people', icon: Users },
  { key: 'PROGRAM', label: 'Program', href: '/program', icon: Presentation },
  { key: 'MORE', label: 'More', href: '/more', icon: MoreHorizontal },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const { isLoaded, isSuperAdmin, isCoordinator, isOps, isReadOnly } = useRole();
  const { navMode } = useResponsiveNav();

  const enabled = isResponsiveShellEnabled();

  if (!shouldShowTabBar(navMode, enabled)) return null;

  // Determine the user's role for tab filtering
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

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  function isVisible(tabKey: string) {
    const allowedRoles = TAB_ACCESS[tabKey];
    return allowedRoles?.includes(userRole) ?? false;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface safe-area-pb safe-area-pl safe-area-pr">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {tabs.map((tab) => {
          if (!isVisible(tab.key)) return null;

          const active = isActive(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
