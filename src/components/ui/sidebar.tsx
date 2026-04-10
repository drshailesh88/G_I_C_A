'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type SidebarContext = {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

const SidebarCtx = React.createContext<SidebarContext | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarCtx);
  if (!ctx) throw new Error('useSidebar must be used within <SidebarProvider>');
  return ctx;
}

export function SidebarProvider({
  collapsed = false,
  onCollapsedChange,
  children,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(collapsed);

  React.useEffect(() => {
    setInternalCollapsed(collapsed);
  }, [collapsed]);

  const setCollapsed = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const next = typeof value === 'function' ? value(internalCollapsed) : value;
      setInternalCollapsed(next);
      onCollapsedChange?.(next);
    },
    [internalCollapsed, onCollapsedChange],
  );

  const ctx = React.useMemo(
    () => ({ collapsed: internalCollapsed, setCollapsed }),
    [internalCollapsed, setCollapsed],
  );

  return <SidebarCtx.Provider value={ctx}>{children}</SidebarCtx.Provider>;
}

export const Sidebar = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<'aside'> & { collapsed?: boolean }
>(({ className, collapsed: collapsedProp, ...props }, ref) => {
  const ctx = React.useContext(SidebarCtx);
  const collapsed = collapsedProp ?? ctx?.collapsed ?? false;

  return (
    <aside
      ref={ref}
      data-testid="app-sidebar"
      data-collapsed={collapsed}
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
      {...props}
    />
  );
});
Sidebar.displayName = 'Sidebar';

export const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center px-3 py-2', className)} {...props} />
));
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex-1 overflow-y-auto px-3 py-2', className)} {...props} />
));
SidebarContent.displayName = 'SidebarContent';

export const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('border-t border-border px-3 py-2', className)} {...props} />
));
SidebarFooter.displayName = 'SidebarFooter';

export const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mb-4', className)} {...props} />
));
SidebarGroup.displayName = 'SidebarGroup';

export const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-text-muted', className)}
    {...props}
  />
));
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

export const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<'ul'>
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn('flex flex-col gap-0.5', className)} {...props} />
));
SidebarMenu.displayName = 'SidebarMenu';

export const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<'li'>
>(({ className, ...props }, ref) => <li ref={ref} className={cn(className)} {...props} />);
SidebarMenuItem.displayName = 'SidebarMenuItem';

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  }
>(({ className, asChild, isActive, tooltip: _tooltip, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      data-active={isActive || undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-accent',
        isActive
          ? 'bg-accent-light text-primary'
          : 'text-text-secondary hover:bg-accent-light hover:text-primary',
        className,
      )}
      {...props}
    />
  );
});
SidebarMenuButton.displayName = 'SidebarMenuButton';

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<'button'>) {
  const { collapsed, setCollapsed } = useSidebar();
  return (
    <button
      type="button"
      data-testid="sidebar-trigger"
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-accent-light hover:text-primary',
        className,
      )}
      onClick={(e) => {
        onClick?.(e);
        setCollapsed(!collapsed);
      }}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<'main'>) {
  return (
    <main
      data-testid="content-area"
      className={cn('relative flex min-h-svh flex-1 flex-col bg-background', className)}
      {...props}
    />
  );
}
