import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveMetricGridProps {
  children: ReactNode;
  minCardWidth?: number;
  gap?: string;
  className?: string;
}

export function ResponsiveMetricGrid({
  children,
  minCardWidth = 240,
  gap = 'var(--space-md, 0.75rem)',
  className,
}: ResponsiveMetricGridProps) {
  return (
    <div
      className={cn('@container grid', className)}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minCardWidth}px), 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}
