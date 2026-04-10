'use client';

import type { ReactNode } from 'react';

export type ColumnPriority = 'high' | 'medium' | 'low' | 1 | 2 | 3;

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  priority: ColumnPriority;
}

export type ColumnDef<T> = Column<T>;

export interface ResponsiveListProps<T> {
  data: T[];
  columns: Column<T>[];
  renderCard: (item: T) => ReactNode;
  keyExtractor?: (item: T) => string;
  emptyState?: ReactNode;
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
}

function normalizePriority(priority: ColumnPriority): 'high' | 'medium' | 'low' {
  if (priority === 'high' || priority === 1) return 'high';
  if (priority === 'medium' || priority === 2) return 'medium';
  return 'low';
}

function defaultKeyExtractor<T>(item: T, index: number): string {
  if (typeof item === 'object' && item !== null && 'id' in item) {
    const value = (item as { id?: unknown }).id;
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }
  return String(index);
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg bg-border" />
      ))}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-10 rounded bg-border" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-8 rounded bg-border/50" />
      ))}
    </div>
  );
}

export function ResponsiveList<T>({
  data,
  columns,
  renderCard,
  keyExtractor,
  emptyState,
  isLoading,
  onRowClick,
}: ResponsiveListProps<T>) {
  if (isLoading) {
    return (
      <div data-testid="responsive-list" className="@container" style={{ containerType: 'inline-size' }}>
        <div className="@[1024px]:hidden">
          <SkeletonCards />
        </div>
        <div className="hidden @[1024px]:block">
          <SkeletonTable />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return <div data-testid="responsive-list">{emptyState}</div>;
  }

  const normalizedColumns = columns.map((column) => ({
    ...column,
    normalizedPriority: normalizePriority(column.priority),
  }));
  const tableColumns = normalizedColumns.filter((c) => c.normalizedPriority !== 'low');
  const lowPriorityColumns = normalizedColumns.filter((c) => c.normalizedPriority === 'low');

  return (
    <div data-testid="responsive-list" className="@container" style={{ containerType: 'inline-size' }}>
      <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-2 @[1024px]:hidden">
        {data.map((item, index) => (
          <div
            key={keyExtractor ? keyExtractor(item) : defaultKeyExtractor(item, index)}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            className={onRowClick ? 'cursor-pointer' : undefined}
          >
            {renderCard(item)}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto @[1024px]:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-background">
              {tableColumns.map((col, index) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-sm font-medium text-text-secondary ${
                    index === 0 ? 'sticky left-0 z-[1] bg-white' : ''
                  }`}
                  style={index === 0 ? { position: 'sticky', left: 0 } : undefined}
                >
                  {col.header}
                </th>
              ))}
              {lowPriorityColumns.map((col) => (
                <th
                  key={col.key}
                  className="hidden px-4 py-3 text-left text-sm font-medium text-text-secondary @[1280px]:table-cell"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={keyExtractor ? keyExtractor(item) : defaultKeyExtractor(item, index)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={`border-b border-border hover:bg-background/50 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {tableColumns.map((col, colIndex) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm ${
                      colIndex === 0 ? 'sticky left-0 z-[1] bg-white' : ''
                    }`}
                    style={colIndex === 0 ? { position: 'sticky', left: 0 } : undefined}
                  >
                    {col.render(item)}
                  </td>
                ))}
                {lowPriorityColumns.map((col) => (
                  <td
                    key={col.key}
                    className="hidden px-4 py-3 text-sm @[1280px]:table-cell"
                  >
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
