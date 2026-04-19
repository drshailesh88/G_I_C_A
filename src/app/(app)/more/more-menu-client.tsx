'use client';

import Link from 'next/link';
import {
  Plane,
  Hotel,
  Bus,
  Mail,
  Award,
  QrCode,
  FileText,
  Palette,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { useRole } from '@/hooks/use-role';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';

type MenuItem = {
  label: string;
  description: string;
  href: string;
  icon: typeof Plane;
  section: string;
  roles: ('super_admin' | 'coordinator' | 'ops' | 'read_only')[];
};

const MENU_ITEMS: MenuItem[] = [
  // LOGISTICS — Ops + Super Admin + Coordinator
  { label: 'Travel', description: 'Manage travel records', href: '/events', icon: Plane, section: 'LOGISTICS', roles: ['super_admin', 'coordinator', 'ops', 'read_only'] },
  { label: 'Accommodation', description: 'Hotels & room assignments', href: '/events', icon: Hotel, section: 'LOGISTICS', roles: ['super_admin', 'coordinator', 'ops', 'read_only'] },
  { label: 'Transport', description: 'Vehicle batches & kanban', href: '/events', icon: Bus, section: 'LOGISTICS', roles: ['super_admin', 'coordinator', 'ops', 'read_only'] },
  // COMMUNICATIONS
  { label: 'Communications', description: 'Templates & triggers', href: '/events', icon: Mail, section: 'COMMUNICATIONS', roles: ['super_admin', 'coordinator'] },
  // CERTIFICATES & QR
  { label: 'Certificates', description: 'Generate & manage certificates', href: '/events', icon: Award, section: 'CERTIFICATES & QR', roles: ['super_admin', 'coordinator'] },
  { label: 'QR Scanner', description: 'Scan & check-in attendees', href: '/scanner', icon: QrCode, section: 'CERTIFICATES & QR', roles: ['super_admin', 'coordinator'] },
  // REPORTS & SETTINGS
  { label: 'Reports', description: 'Cross-event exports & analytics', href: '/reports', icon: FileText, section: 'REPORTS & SETTINGS', roles: ['super_admin'] },
  { label: 'Branding', description: 'Logo, colors, letterheads', href: '/events', icon: Palette, section: 'REPORTS & SETTINGS', roles: ['super_admin', 'coordinator'] },
  { label: 'Team & Roles', description: 'Manage team members', href: '/settings/team', icon: Settings, section: 'REPORTS & SETTINGS', roles: ['super_admin'] },
];

export function MoreMenuClient() {
  const { isLoaded, isSuperAdmin, isCoordinator, isOps, isReadOnly } = useRole();
  const { navMode } = useResponsiveNav();

  // On desktop, sidebar handles navigation — more menu is redundant
  if (navMode === 'desktop') return null;

  const userRole = isSuperAdmin
    ? 'super_admin'
    : isCoordinator
      ? 'coordinator'
      : isOps
        ? 'ops'
        : isReadOnly
          ? 'read_only'
          : null;

  const visibleItems = MENU_ITEMS.filter((item) => {
    if (!isLoaded || !userRole) return true;
    return item.roles.includes(userRole);
  });

  const sections = [...new Set(visibleItems.map((item) => item.section))];

  return (
    <div style={{ padding: 'var(--space-md) var(--space-sm)' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)' }} className="font-bold text-text-primary">More</h1>
      <p className="mt-1 text-text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
        {isOps ? 'Logistics tools for your events' : 'Additional tools and settings'}
      </p>

      {sections.map((section) => (
        <div key={section} style={{ marginTop: 'var(--space-lg)' }}>
          <h2 style={{ marginBottom: 'var(--space-sm)', fontSize: 'var(--font-size-xs)' }} className="font-semibold uppercase tracking-wider text-text-muted">
            {section}
          </h2>
          <div className="flex flex-col" style={{ gap: 'var(--space-2xs)' }}>
            {visibleItems
              .filter((item) => item.section === section)
              .map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-3 transition-colors hover:bg-border/30"
                    style={{ padding: 'var(--space-xs)', minHeight: 'var(--touch-min)' }}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p style={{ fontSize: 'var(--font-size-sm)' }} className="font-medium text-text-primary">{item.label}</p>
                      <p style={{ fontSize: 'var(--font-size-xs)' }} className="text-text-muted">{item.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-text-muted" />
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
