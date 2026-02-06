import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
import type * as React from "react";

import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getColumnPinningStyle } from "@/lib/data-table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>;
  actionBar?: React.ReactNode;
}

export function DataTable<TData>({
  table,
  actionBar,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  return (
    <div
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="bg-card">
          <TableHeader className="bg-secondary">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-border bg-secondary hover:bg-secondary"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getColumnPinningStyle({ column: header.column }),
                    }}
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
          <TableBody className="bg-card">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b border-border bg-card hover:bg-muted/30 data-[state=selected]:bg-primary/10"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getColumnPinningStyle({ column: cell.column }),
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="bg-card">
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        <DataTablePagination table={table} />
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  );
}
