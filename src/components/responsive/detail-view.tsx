'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';

interface StandardDetailViewProps {
  list: ReactNode;
  detail: ReactNode | null;
  properties?: ReactNode;
  showDetail?: boolean;
  onBack?: () => void;
  listWidth?: string;
  emptyMessage?: string;
}

interface LegacySplitViewProps {
  main: ReactNode;
  sidebar?: ReactNode;
  className?: string;
  sidebarPosition?: 'left' | 'right';
}

export type DetailViewProps = StandardDetailViewProps | LegacySplitViewProps;

function isLegacySplitView(props: DetailViewProps): props is LegacySplitViewProps {
  return !('list' in props) && props.main !== undefined;
}

function getSafeListWidth(listWidth: string): string {
  return /^(\d{1,3}%|\d+(?:\.\d+)?(px|rem|fr))$/.test(listWidth) ? listWidth : '40%';
}

export function DetailView(props: DetailViewProps) {
  if (isLegacySplitView(props)) {
    const { main, sidebar, className, sidebarPosition = 'right' } = props;
    return (
      <div
        data-testid="detail-view"
        className={cn('flex h-full flex-col md:flex-row', className)}
      >
        {sidebarPosition === 'left' && sidebar && (
          <aside className="hidden w-full shrink-0 border-r border-gray-200 md:block md:w-72 lg:w-80">
            {sidebar}
          </aside>
        )}
        <div className="min-h-0 flex-1">{main}</div>
        {sidebarPosition === 'right' && sidebar && (
          <aside className="hidden w-full shrink-0 overflow-auto border-l border-gray-200 md:block md:w-72 lg:w-80">
            {sidebar}
          </aside>
        )}
      </div>
    );
  }

  const {
    list,
    detail,
    properties,
    showDetail = false,
    onBack,
    listWidth = '40%',
    emptyMessage = 'Select an item to view details',
  } = props;
  const { isMobile } = useResponsiveNav();
  const safeListWidth = getSafeListWidth(listWidth);

  if (isMobile) {
    if (showDetail && detail) {
      return (
        <div data-testid="detail-view" className="flex h-full flex-col">
          <button
            onClick={onBack}
            data-testid="detail-view-back"
            className="flex items-center gap-1 px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div data-testid="detail-view-detail" className="flex-1 overflow-y-auto">{detail}</div>
        </div>
      );
    }
    return <div data-testid="detail-view" className="h-full overflow-y-auto">{list}</div>;
  }

  return (
    <div
      data-testid="detail-view"
      className="grid h-full gap-0"
      style={{
        display: 'grid',
        gridTemplateColumns: properties ? `${safeListWidth} 1fr minmax(18rem, 25%)` : `${safeListWidth} 1fr`,
      }}
    >
      <div data-testid="detail-view-list" className={cn('overflow-y-auto border-r border-border')}>
        {list}
      </div>
      <div data-testid="detail-view-detail" className="overflow-y-auto">
        {detail ?? (
          <div className="flex h-full items-center justify-center text-text-muted">
            <p>{emptyMessage}</p>
          </div>
        )}
      </div>
      {properties && (
        <aside className="hidden overflow-y-auto border-l border-border xl:block">
          {properties}
        </aside>
      )}
    </div>
  );
}
