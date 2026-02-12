import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { Invoice } from "@/types/domain";
import { Clock, AlertTriangle } from "lucide-react";

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
  sent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  viewed: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  unpaid: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  partially_paid: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  overdue: "bg-red-500/20 text-red-400 border-red-500/30",
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  void: "bg-destructive/20 text-destructive border-destructive/30",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
};

export { statusStyles };

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
      {initials || "?"}
    </div>
  );
}

function isOverdue(invoice: Invoice): boolean {
  if (!invoice.due_date || invoice.balance <= 0) return false;
  return new Date(invoice.due_date) < new Date();
}

interface ColumnOptions {
  statusOptions?: { label: string; value: string; count?: number }[];
  salespersonOptions?: { label: string; value: string; count?: number }[];
}

export function getInvoiceColumns(
  statusOptions?: ColumnOptions["statusOptions"],
  salespersonOptions?: ColumnOptions["salespersonOptions"]
): ColumnDef<Invoice>[] {
  const defaultStatusOptions = [
    { label: "Draft", value: "draft" },
    { label: "Sent", value: "sent" },
    { label: "Viewed", value: "viewed" },
    { label: "Unpaid", value: "unpaid" },
    { label: "Partially Paid", value: "partially_paid" },
    { label: "Overdue", value: "overdue" },
    { label: "Paid", value: "paid" },
    { label: "Void", value: "void" },
  ];

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
      accessorFn: (row) => row.invoice_number,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Invoice #" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground">
          {row.original.invoice_number}
        </span>
      ),
      size: 140,
      enableColumnFilter: true,
      meta: {
        label: "Invoice #",
        placeholder: "Search invoices...",
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
      id: "invoice_date",
      accessorKey: "invoice_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Invoice Date" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.invoice_date)}
        </span>
      ),
      size: 130,
      enableColumnFilter: false,
      meta: { label: "Invoice Date" },
    },
    {
      id: "due_date",
      accessorKey: "due_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Due Date" />
      ),
      cell: ({ row }) => {
        const overdue = isOverdue(row.original);
        return (
          <div className="flex items-center gap-1.5">
            {overdue && <AlertTriangle size={14} className="text-red-400 shrink-0" />}
            <span className={`text-sm ${overdue ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
              {formatDate(row.original.due_date)}
            </span>
          </div>
        );
      },
      size: 130,
      enableColumnFilter: false,
      meta: { label: "Due Date" },
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
        options: statusOptions && statusOptions.length > 0 ? statusOptions : defaultStatusOptions,
      },
    },
    {
      id: "salesperson_name",
      accessorKey: "salesperson_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Salesperson" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate">
          {row.original.salesperson_name || "-"}
        </span>
      ),
      size: 150,
      enableColumnFilter: true,
      meta: {
        label: "Salesperson",
        variant: "multiSelect" as const,
        options: salespersonOptions || [],
      },
    },
    {
      id: "total",
      accessorKey: "total",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Total" />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatCurrency(row.original.total)}
        </span>
      ),
      size: 110,
      enableColumnFilter: false,
      meta: { label: "Total" },
    },
    {
      id: "balance",
      accessorKey: "balance",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Balance" />
      ),
      cell: ({ row }) => {
        const bal = row.original.balance;
        const overdue = isOverdue(row.original);
        return (
          <div className="flex items-center gap-1.5">
            {overdue && bal > 0 && <Clock size={13} className="text-red-400 shrink-0" />}
            <span className={`text-sm tabular-nums ${bal > 0 ? (overdue ? "text-red-400 font-semibold" : "text-orange-400 font-medium") : "text-emerald-400"}`}>
              {formatCurrency(bal)}
            </span>
          </div>
        );
      },
      size: 120,
      enableColumnFilter: false,
      meta: { label: "Balance" },
    },
  ];
}
