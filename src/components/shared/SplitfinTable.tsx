import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type TableOptions,
} from '@tanstack/react-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SplitfinTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  title?: string;
  viewAllLink?: { label?: string; onClick: () => void };
  loading?: boolean;
  skeletonRows?: number;
  emptyState?: {
    icon?: React.ReactNode;
    title: string;
    description?: string;
  };
  onRowClick?: (row: TData) => void;
  className?: string;
}

function SplitfinTable<TData>({
  columns,
  data,
  title,
  viewAllLink,
  loading = false,
  skeletonRows = 5,
  emptyState,
  onRowClick,
  className,
}: SplitfinTableProps<TData>) {
  const tableOptions: TableOptions<TData> = {
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  };

  const table = useReactTable(tableOptions);

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card overflow-hidden',
        className,
      )}
    >
      {/* Title bar */}
      {(title || viewAllLink) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          {title && (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          )}
          {viewAllLink && (
            <button
              onClick={viewAllLink.onClick}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {viewAllLink.label || 'View All'}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-b border-border bg-muted/30 hover:bg-muted/30"
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  'table-row-hover border-b border-border/30',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center"
              >
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  {emptyState?.icon && (
                    <div className="text-muted-foreground/50">
                      {emptyState.icon}
                    </div>
                  )}
                  <p className="text-sm font-medium">
                    {emptyState?.title || 'No data'}
                  </p>
                  {emptyState?.description && (
                    <p className="text-xs text-muted-foreground/70">
                      {emptyState.description}
                    </p>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default SplitfinTable;
export type { SplitfinTableProps };
