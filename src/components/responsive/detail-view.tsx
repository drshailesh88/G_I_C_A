'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';

export interface DetailViewProps {
  list: ReactNode;
  detail: ReactNode | null;
  /** Optional third panel (e.g. properties) */
  properties?: ReactNode;
  /** Whether to show detail panel on mobile (hides list) */
  showDetail?: boolean;
  /** Callback when back button is pressed on mobile */
  onBack?: () => void;
  /** List panel width on desktop. Default '40%' */
  listWidth?: string;
  /** Empty state message when no detail selected */
  emptyMessage?: string;
}

export function DetailView({
  list,
  detail,
  properties,
  showDetail = false,
  onBack,
  listWidth = '40%',
  emptyMessage = 'Select an item to view details',
}: DetailViewProps) {
  const { isMobile } = useResponsiveNav();

  // Mobile: show one panel at a time
  if (isMobile) {
    if (showDetail && detail) {
      return (
        <div className="flex h-full flex-col">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex-1 overflow-y-auto">{detail}</div>
        </div>
      );
    }
    return <div className="h-full overflow-y-auto">{list}</div>;
  }

  // Tablet / Desktop: side-by-side
  return (
    <div
      className="flex h-full gap-0"
      style={{ display: 'grid', gridTemplateColumns: `${listWidth} 1fr` }}
    >
      <div className={cn('overflow-y-auto border-r border-border')}>{list}</div>
      <div className="overflow-y-auto">
        {detail ?? (
          <div className="flex h-full items-center justify-center text-text-muted">
            <p>{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
