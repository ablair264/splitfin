import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { PackageListItem } from "@/services/warehouseService";
import { Truck, Package, ExternalLink } from "lucide-react";
import { trackingService } from "@/services/trackingService";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

const statusStyles: Record<string, string> = {
  delivery_booked: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  shipped: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  delivered: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  in_transit: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  packed: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  sent_to_packing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  not_shipped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
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
  const initials = (name || "?")
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

export function getDeliveryColumns(
  statusOptions: { label: string; value: string; count?: number }[],
): ColumnDef<PackageListItem>[] {
  return [
    {
      accessorKey: "packing_number",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Package" />,
      cell: ({ row }) => {
        const pkg = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Package size={14} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{pkg.packing_number}</div>
              <div className="truncate text-xs text-muted-foreground">{pkg.salesorder_number}</div>
            </div>
          </div>
        );
      },
      enableSorting: true,
      size: 180,
    },
    {
      accessorKey: "customer_name",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Customer" />,
      cell: ({ row }) => {
        const name = row.original.customer_name;
        return (
          <div className="flex items-center gap-2">
            <CustomerAvatar name={name} />
            <span className="truncate text-sm">{name}</span>
          </div>
        );
      },
      enableSorting: true,
      size: 200,
    },
    {
      accessorKey: "warehouse_status",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.warehouse_status} />,
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
      enableSorting: true,
      size: 140,
    },
    {
      accessorKey: "carrier_name",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Courier" />,
      cell: ({ row }) => {
        const carrier = row.original.carrier_name;
        return (
          <div className="flex items-center gap-2">
            <Truck size={14} className="text-muted-foreground" />
            <span className="truncate text-sm">{carrier || "Not assigned"}</span>
          </div>
        );
      },
      enableSorting: true,
      size: 150,
    },
    {
      accessorKey: "tracking_number",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Tracking" />,
      cell: ({ row }) => {
        const tn = row.original.tracking_number;
        if (!tn) return <span className="text-xs text-muted-foreground">-</span>;
        const carrier = row.original.carrier_name?.toLowerCase();
        const url = trackingService.getTrackingUrl(tn, carrier);
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate max-w-[120px]">{tn}</span>
            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        );
      },
      enableSorting: false,
      size: 160,
    },
    {
      accessorKey: "shipping_city",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Destination" />,
      cell: ({ row }) => {
        const pkg = row.original;
        const parts = [pkg.shipping_city, pkg.shipping_code].filter(Boolean);
        return (
          <span className="truncate text-sm text-muted-foreground">
            {parts.length > 0 ? parts.join(", ") : "-"}
          </span>
        );
      },
      enableSorting: true,
      size: 150,
    },
    {
      accessorKey: "delivery_booked_at",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Booked" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.delivery_booked_at)}
        </span>
      ),
      enableSorting: true,
      size: 110,
    },
    {
      accessorKey: "order_total",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Value" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{formatCurrency(row.original.order_total)}</span>
      ),
      enableSorting: true,
      size: 100,
    },
  ];
}
