import React, { useMemo, useState } from 'react';
import { cn } from './Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table';

export type DataTableColumn<T> = {
  id: string;
  header: string;
  sortable?: boolean;
  className?: string;
  accessor?: (row: T) => string | number | React.ReactNode;
  cell?: (row: T) => React.ReactNode;
};

type SortDir = 'asc' | 'desc';

function defaultAccessor<T>(row: T, id: string): string | number {
  const v = (row as Record<string, unknown>)[id];
  if (typeof v === 'string' || typeof v === 'number') return v;
  return String(v ?? '');
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  filterKeys?: string[];
  filterPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  filterKeys,
  filterPlaceholder = 'Filter…',
  emptyLabel = 'No rows to display.',
  className,
}: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter.trim() || !filterKeys?.length) return data;
    const q = filter.toLowerCase();
    return data.filter((row) =>
      filterKeys.some((key) => String(defaultAccessor(row, key)).toLowerCase().includes(q)),
    );
  }, [data, filter, filterKeys]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const col = columns.find((c) => c.id === sortCol);
    if (!col?.sortable) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.accessor ? col.accessor(a) : defaultAccessor(a, sortCol);
      const bv = col.accessor ? col.accessor(b) : defaultAccessor(b, sortCol);
      const as = typeof av === 'number' ? av : String(av).toLowerCase();
      const bs = typeof bv === 'number' ? bv : String(bv).toLowerCase();
      if (as < bs) return -1 * dir;
      if (as > bs) return 1 * dir;
      return 0;
    });
  }, [filtered, sortCol, sortDir, columns]);

  const toggleSort = (id: string) => {
    const col = columns.find((c) => c.id === id);
    if (!col?.sortable) return;
    if (sortCol !== id) {
      setSortCol(id);
      setSortDir('asc');
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {filterKeys && filterKeys.length > 0 && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={filterPlaceholder}
          className="w-full max-w-sm rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.id} className={col.className}>
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.id)}
                    className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-primary"
                  >
                    {col.header}
                    {sortCol === col.id && (
                      <span className="text-xs text-primary">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-neutral-500">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((col) => (
                  <TableCell key={col.id} className={col.className}>
                    {col.cell ? col.cell(row) : String(col.accessor ? col.accessor(row) : defaultAccessor(row, col.id))}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
