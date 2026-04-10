'use client';

import type { ReactNode } from 'react';
import type { NavMode } from '@/hooks/use-responsive-nav';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';
import { AppSidebar } from '@/components/sidebar';

export function isResponsiveShellEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RESPONSIVE_SHELL === 'true';
}

export function shouldShowSidebar(navMode: NavMode, enabled: boolean): boolean {
  if (!enabled) return false;
  return navMode !== 'mobile';
}

export function shouldShowTabBar(navMode: NavMode, enabled: boolean): boolean {
  if (!enabled) return true;
  return navMode === 'mobile';
}

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { navMode } = useResponsiveNav();
  const enabled = isResponsiveShellEnabled();
  const showSidebar = shouldShowSidebar(navMode, enabled);

  return (
    <div className={showSidebar ? 'grid min-h-screen grid-cols-[auto_1fr] bg-background' : 'min-h-screen bg-background'}>
      {showSidebar && <AppSidebar />}
      <main
        data-testid="content-area"
        className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 md:pb-0 lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
