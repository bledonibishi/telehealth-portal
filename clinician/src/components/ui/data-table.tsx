'use client';

import { useEffect, useRef } from 'react';
import { flexRender, type Header, type RowData, type Table } from '@tanstack/react-table';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { PAGE_SIZES, readSize, rememberPageSize, type Pager } from './Pagination';

/**
 * The tables' shared kit, built on TanStack Table (headless: it holds the state and the logic, and every pixel is still ours).
 * A screen defines its columns and hands the table to these pieces:
 *
 *   const table = useReactTable({ data, columns, ...tableDefaults, state: { sorting, pagination }, ... });
 *   <SortableTh header={h} />       a column header that sorts
 *   <DataRows table={table} ... />  the rows
 *   <Pagination state={useTablePager(table, resetKey)} />
 */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes for this column's header cell and for its body cells. */
    headerClassName?: string;
    cellClassName?: string;
  }
}

/** The table options every list wants: one sort at a time that flips between ascending and descending, and no page jump when the data refreshes. */
export const tableDefaults = {
  enableSortingRemoval: false,
  enableMultiSort: false,
  autoResetPageIndex: false,
} as const;

/** A header cell that sorts its column on click, with the ▲ ▼ showing which way. */
export function SortableTh<T>({ header }: { header: Header<T, unknown> }) {
  const { t } = useI18n();
  const { column } = header;
  const sorted = column.getIsSorted();
  const label = typeof column.columnDef.header === 'string' ? column.columnDef.header : '';
  return (
    <th className={`px-4 py-3 whitespace-nowrap font-medium ${column.columnDef.meta?.headerClassName ?? ''}`} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}>
      <button
        type="button"
        onClick={column.getToggleSortingHandler()}
        className={`flex items-center gap-1 hover:text-[color:var(--t-strong)] ${sorted ? 'text-[color:var(--t-strong)]' : ''}`}
      >
        {t(label)}
        <span className={`text-[10px] ${sorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>{sorted === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  );
}

/** The body rows of a table: each cell is whatever its column's `cell` draws. `rowProps` adds the screen's own behaviour to a row (click, hover, highlight). */
export function DataRows<T>({ table, rowProps }: { table: Table<T>; rowProps?: (row: T) => React.HTMLAttributes<HTMLTableRowElement> }) {
  return (
    <>
      {table.getRowModel().rows.map((row) => (
        <tr key={row.id} {...rowProps?.(row.original)}>
          {row.getVisibleCells().map((cell) => (
            <td key={cell.id} className={cell.column.columnDef.meta?.cellClassName}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Drives the page bar from a table's own paging. `resetKey` is whatever should send the reader back to the first page
 * (the filters, the search); the page size is remembered. Use it with `autoResetPageIndex: false` (see tableDefaults),
 * so a refresh of the same data never moves the reader off their page.
 */
export function useTablePager<T>(table: Table<T>, resetKey: unknown = ''): Pager {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getPrePaginationRowModel().rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // The remembered page size is applied once, on arrival.
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const size = readSize(pageSize);
    if (PAGE_SIZES.includes(size) && size !== pageSize) table.setPageSize(size);
  }, [pageSize, table]);

  const key = JSON.stringify(resetKey);
  useEffect(() => { table.setPageIndex(0); }, [key, table]);
  // A list that shrinks never leaves the reader on a page that no longer exists.
  useEffect(() => { if (pageIndex > totalPages - 1) table.setPageIndex(totalPages - 1); }, [pageIndex, totalPages, table]);

  return {
    page: pageIndex + 1,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : pageIndex * pageSize + 1,
    to: Math.min((pageIndex + 1) * pageSize, total),
    setPage: (n) => table.setPageIndex(Math.min(Math.max(1, n), totalPages) - 1),
    setPageSize: (n) => { table.setPageSize(n); table.setPageIndex(0); rememberPageSize(n); },
  };
}
