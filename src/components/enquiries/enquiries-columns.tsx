import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { Enquiry } from "@/services/enquiryService";
import { cn } from "@/lib/utils";

function formatCurrency(value: number | null | undefined): string {
  if (value == null || value === 0) return "-";
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
  new: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  contacted: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  quoted: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  negotiating: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  won: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  lost: "bg-red-500/20 text-red-400 border-red-500/30",
  cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const priorityStyles: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const sourceStyles: Record<string, string> = {
  trade_portal: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  website: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  trade_show: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  referral: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  email: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  phone: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

function Badge({ value, styles }: { value: string; styles: Record<string, string> }) {
  const label = value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const style = styles[value] || "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

export function getEnquiryColumns(
  statusOptions: { label: string; value: string; count?: number }[],
  priorityOptions: { label: string; value: string; count?: number }[],
  sourceOptions: { label: string; value: string; count?: number }[],
): ColumnDef<Enquiry>[] {
  return [
    {
      id: "expand",
      header: () => null,
      cell: ({ row }) => {
        if (row.original.lead_source !== "trade_portal") return null;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
            className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              size={14}
              className={cn(
                "transition-transform duration-200",
                row.getIsExpanded() && "rotate-180",
              )}
            />
          </button>
        );
      },
      size: 32,
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
    },
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
      accessorFn: (row) => row.enquiry_number,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Enquiry #" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground">
            #{row.original.enquiry_number}
          </span>
          {row.original.lead_source === "trade_portal" && (
            <Badge value="trade_portal" styles={sourceStyles} />
          )}
        </div>
      ),
      size: 180,
      enableColumnFilter: true,
      meta: {
        label: "Enquiry #",
        placeholder: "Search enquiries...",
        variant: "text" as const,
      },
    },
    {
      id: "contact_name",
      accessorKey: "contact_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Contact" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {row.original.contact_name}
          </span>
          {row.original.company_name && (
            <span className="text-xs text-muted-foreground truncate">
              {row.original.company_name}
            </span>
          )}
        </div>
      ),
      size: 180,
      enableColumnFilter: false,
      meta: { label: "Contact" },
    },
    {
      id: "subject",
      accessorKey: "subject",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Subject" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-foreground/80 truncate block max-w-[200px]">
          {row.original.subject || "-"}
        </span>
      ),
      size: 200,
      enableColumnFilter: false,
      meta: { label: "Subject" },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Status" />
      ),
      cell: ({ row }) => <Badge value={row.original.status} styles={statusStyles} />,
      size: 130,
      enableColumnFilter: true,
      meta: {
        label: "Status",
        variant: "multiSelect" as const,
        options: statusOptions,
      },
    },
    {
      id: "priority",
      accessorKey: "priority",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Priority" />
      ),
      cell: ({ row }) => <Badge value={row.original.priority} styles={priorityStyles} />,
      size: 110,
      enableColumnFilter: true,
      meta: {
        label: "Priority",
        variant: "multiSelect" as const,
        options: priorityOptions,
      },
    },
    {
      id: "lead_source",
      accessorKey: "lead_source",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Source" />
      ),
      cell: ({ row }) => <Badge value={row.original.lead_source} styles={sourceStyles} />,
      size: 130,
      enableColumnFilter: true,
      meta: {
        label: "Source",
        variant: "multiSelect" as const,
        options: sourceOptions,
      },
    },
    {
      id: "estimated_value",
      accessorKey: "estimated_value",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Value" />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-medium text-foreground tabular-nums">
          {formatCurrency(row.original.estimated_value)}
        </span>
      ),
      size: 110,
      enableColumnFilter: false,
      meta: { label: "Value" },
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Created" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
      size: 120,
      enableColumnFilter: false,
      meta: { label: "Created" },
    },
  ];
}
