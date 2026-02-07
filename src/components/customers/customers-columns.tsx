import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { Customer } from "@/types/domain";

function formatCurrency(value: number | null | undefined): string {
  if (value == null || value === 0) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

const segmentStyles: Record<string, string> = {
  VIP: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  High: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Low: "bg-muted text-muted-foreground border-border",
};

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

// Region options from DB analysis
const REGION_OPTIONS = [
  { label: "Other", value: "Other" },
  { label: "Scotland", value: "Scotland" },
  { label: "London", value: "London" },
  { label: "Midlands", value: "Midlands" },
  { label: "North West", value: "North West" },
  { label: "South East", value: "South East" },
  { label: "South West", value: "South West" },
  { label: "Wales", value: "Wales" },
  { label: "Ireland", value: "Ireland" },
];

const SEGMENT_OPTIONS = [
  { label: "VIP", value: "VIP" },
  { label: "High", value: "High" },
  { label: "Medium", value: "Medium" },
  { label: "Low", value: "Low" },
];

const PAYMENT_TERMS_OPTIONS = [
  { label: "Net 30", value: "Net 30" },
  { label: "Due on Receipt", value: "Due on Receipt" },
  { label: "Due end of next month", value: "Due end of next month" },
  { label: "Net 60", value: "Net 60" },
];

export function getCustomerColumns(): ColumnDef<Customer>[] {
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
      accessorFn: (row) => row.company_name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Customer" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 min-w-0">
          <CustomerAvatar name={row.original.company_name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {row.original.company_name}
            </div>
            {row.original.location_region && (
              <div className="text-xs text-muted-foreground">
                {row.original.location_region}
              </div>
            )}
          </div>
        </div>
      ),
      size: 240,
      enableColumnFilter: true,
      meta: {
        label: "Customer",
        placeholder: "Search customers...",
        variant: "text" as const,
      },
    },
    {
      id: "contact",
      accessorFn: (row) => row.email,
      header: "Contact",
      cell: ({ row }) => (
        <div className="min-w-0 text-sm">
          <div className={`truncate ${row.original.email ? "text-foreground" : "italic text-muted-foreground"}`}>
            {row.original.email || "No email"}
          </div>
          {row.original.phone && (
            <div className="text-xs text-muted-foreground">{row.original.phone}</div>
          )}
        </div>
      ),
      size: 220,
      enableSorting: false,
      enableColumnFilter: false,
      meta: { label: "Contact" },
    },
    {
      id: "region",
      accessorKey: "location_region",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Region" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.location_region || "-"}
        </span>
      ),
      size: 120,
      enableColumnFilter: true,
      meta: {
        label: "Region",
        variant: "multiSelect" as const,
        options: REGION_OPTIONS,
      },
    },
    {
      id: "total_spent",
      accessorKey: "total_spent",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Spent" />
      ),
      cell: ({ row }) => (
        <span className={`text-sm text-right block ${row.original.total_spent > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {formatCurrency(row.original.total_spent)}
        </span>
      ),
      size: 100,
      enableColumnFilter: false,
      meta: { label: "Spent" },
    },
    {
      id: "outstanding_receivable",
      accessorKey: "outstanding_receivable",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Owed" />
      ),
      cell: ({ row }) => {
        const val = row.original.outstanding_receivable;
        return (
          <span className={`text-sm text-right block ${val > 0 ? "font-semibold text-red-400" : "text-muted-foreground"}`}>
            {val > 0 ? formatCurrency(val) : "-"}
          </span>
        );
      },
      size: 100,
      enableColumnFilter: false,
      meta: { label: "Owed" },
    },
    {
      id: "last_order_date",
      accessorKey: "last_order_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Last Order" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.last_order_date)}
        </span>
      ),
      size: 110,
      enableColumnFilter: false,
      meta: { label: "Last Order" },
    },
    {
      id: "payment_terms_label",
      accessorKey: "payment_terms_label",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Terms" />
      ),
      cell: ({ row }) => {
        const terms = row.original.payment_terms_label;
        if (!terms) return <span className="text-sm text-muted-foreground">-</span>;
        // Normalise "Due On Receipt" -> "Due on Receipt"
        const label = terms === "Due On Receipt" ? "Due on Receipt" : terms;
        return (
          <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
            {label}
          </span>
        );
      },
      size: 110,
      enableColumnFilter: true,
      meta: {
        label: "Terms",
        variant: "select" as const,
        options: PAYMENT_TERMS_OPTIONS,
      },
    },
    {
      id: "segment",
      accessorKey: "segment",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Segment" />
      ),
      cell: ({ row }) => {
        const segment = row.original.segment;
        if (!segment) return <span className="text-sm text-muted-foreground">-</span>;
        const style = segmentStyles[segment] || "bg-muted text-muted-foreground border-border";
        return (
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}>
            {segment}
          </span>
        );
      },
      size: 90,
      enableColumnFilter: true,
      meta: {
        label: "Segment",
        variant: "select" as const,
        options: SEGMENT_OPTIONS,
      },
    },
  ];
}
