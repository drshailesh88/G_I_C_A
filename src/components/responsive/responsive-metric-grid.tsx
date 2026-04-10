import { type ReactNode } from 'react';

interface ResponsiveMetricGridProps {
  children: ReactNode;
  minCardWidth?: number;
  gap?: string;
}

export function ResponsiveMetricGrid({
  children,
  minCardWidth = 240,
  gap = 'var(--space-md, 0.75rem)',
}: ResponsiveMetricGridProps) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minCardWidth}px), 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}
