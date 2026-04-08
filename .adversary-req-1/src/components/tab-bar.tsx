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

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  function isVisible(tabKey: string) {
    if (!isLoaded || !userRole) return true; // Show all while loading
    const allowedRoles = TAB_ACCESS[tabKey];
    return allowedRoles?.includes(userRole) ?? true;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface">
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
                'flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-xs transition-colors',
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
