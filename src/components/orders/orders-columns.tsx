import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { Order } from "@/types/domain";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

const statusStyles: Record<string, string> = {
  draft: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  confirmed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  fulfilled: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  shipped: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  partially_shipped: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  invoiced: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  partially_invoiced: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  void: "bg-destructive/20 text-destructive border-destructive/30",
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const style = statusStyles[status] || "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

function CustomerAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
      {initials}
    </div>
  );
}

export function getOrderColumns(
  statusOptions: { label: string; value: string; count?: number }[],
  salespersonOptions: { label: string; value: string; count?: number }[],
): ColumnDef<Order>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(val) => row.toggleSelected(!!val)}
          aria-label="Select row"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      ),
      size: 40,
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
    },
    {
      id: "search",
      accessorFn: (row) => row.salesorder_number,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Order #" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground">
          {row.original.salesorder_number}
        </span>
      ),
      size: 130,
      enableColumnFilter: true,
      meta: {
        label: "Order #",
        placeholder: "Search orders...",
        variant: "text" as const,
      },
    },
    {
      id: "customer_name",
      accessorKey: "customer_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Customer" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 min-w-0">
          <CustomerAvatar name={row.original.customer_name} />
          <span className="truncate text-sm text-foreground">
            {row.original.customer_name}
          </span>
        </div>
      ),
      size: 220,
      enableColumnFilter: false,
      meta: { label: "Customer" },
    },
    {
      id: "salesperson_name",
      accessorKey: "salesperson_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Agent" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.salesperson_name || "-"}
        </span>
      ),
      size: 140,
      enableColumnFilter: true,
      meta: {
        label: "Agent",
        variant: "select" as const,
        options: salespersonOptions,
      },
    },
    {
      id: "date",
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Date" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.date)}
        </span>
      ),
      size: 120,
      enableColumnFilter: false,
      meta: { label: "Date" },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Status" />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      size: 140,
      enableColumnFilter: true,
      meta: {
        label: "Status",
        variant: "multiSelect" as const,
        options: statusOptions,
      },
    },
    {
      id: "total",
      accessorKey: "total",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Total" />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground text-right block">
          {formatCurrency(row.original.total)}
        </span>
      ),
      size: 110,
      enableColumnFilter: false,
      meta: { label: "Total" },
    },
  ];
}
