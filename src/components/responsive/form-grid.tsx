import type { ReactNode } from 'react';

export type FormGridColumns = 1 | 2 | 3;

const GRID_CLASSES: Record<FormGridColumns, string> = {
  1: 'grid grid-cols-1 gap-4',
  2: 'grid grid-cols-1 gap-4 md:grid-cols-2',
  3: 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3',
};

export function getFormGridClassName(columns: FormGridColumns = 2): string {
  return GRID_CLASSES[columns];
}

export function FormGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: FormGridColumns;
  className?: string;
}) {
  const baseClassName = getFormGridClassName(columns);
  return (
    <div
      data-testid="form-grid"
      className="form-grid"
      style={{ containerType: 'inline-size' }}
    >
      <div className={className ? `${baseClassName} ${className}` : baseClassName}>
        {children}
      </div>
    </div>
  );
}
