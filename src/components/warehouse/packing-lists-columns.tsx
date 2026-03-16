import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { PackageListItem } from "@/services/warehouseService";
import { Button } from "@/components/ui/button";
import { ScanLine, Truck, Edit, ExternalLink, Printer } from "lucide-react";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

const statusStyles: Record<string, string> = {
  sent_to_packing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  packed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  delivery_booked: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  shipped: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  delivered: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const statusLabels: Record<string, string> = {
  sent_to_packing: "Sent to Packing",
  packed: "Packed",
  delivery_booked: "Delivery Booked",
  shipped: "Shipped",
  delivered: "Delivered",
};

function StatusBadge({ status }: { status: string }) {
  const label = statusLabels[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const style = statusStyles[status] || "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

export interface PackingListActions {
  onScan: (pkg: PackageListItem) => void;
  onEdit: (pkg: PackageListItem) => void;
  onBookDelivery: (pkg: PackageListItem) => void;
  onPrint: (pkg: PackageListItem) => void;
  onViewOrder: (pkg: PackageListItem) => void;
}

export function getPackingListColumns(
  statusOptions: { label: string; value: string; count?: number }[],
  actions: PackingListActions,
): ColumnDef<PackageListItem>[] {
  return [
    {
      id: "search",
      accessorFn: (row) => row.packing_number,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Package #" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground">
          {row.original.packing_number}
        </span>
      ),
      size: 140,
      enableColumnFilter: true,
      meta: {
        label: "Package #",
        placeholder: "Search packages...",
        variant: "text" as const,
      },
    },
    {
      id: "salesorder_number",
      accessorKey: "salesorder_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Order #" />
      ),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.onViewOrder(row.original);
          }}
          className="font-mono text-sm text-primary hover:text-primary/80 transition-colors"
        >
          {row.original.salesorder_number}
        </button>
      ),
      size: 130,
      enableColumnFilter: false,
      meta: { label: "Order #" },
    },
    {
      id: "customer_name",
      accessorKey: "customer_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Customer" />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm text-foreground">
          {row.original.customer_name}
        </span>
      ),
      size: 200,
      enableColumnFilter: false,
      meta: { label: "Customer" },
    },
    {
      id: "item_count",
      accessorKey: "item_count",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Items" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums text-right block">
          {row.original.item_count} {row.original.item_count === 1 ? "item" : "items"}
        </span>
      ),
      size: 80,
      enableSorting: false,
      enableColumnFilter: false,
      meta: { label: "Items" },
    },
    {
      id: "warehouse_status",
      accessorKey: "warehouse_status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Status" />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.warehouse_status} />,
      size: 150,
      enableColumnFilter: true,
      meta: {
        label: "Status",
        variant: "multiSelect" as const,
        options: statusOptions,
      },
    },
    {
      id: "tracking_number",
      accessorKey: "tracking_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Tracking" />
      ),
      cell: ({ row }) => {
        const carrier = row.original.carrier_name;
        const tracking = row.original.tracking_number;
        if (!carrier && !tracking) {
          return <span className="text-sm text-muted-foreground/50">--</span>;
        }
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            {carrier && (
              <span className="text-xs text-muted-foreground truncate">{carrier}</span>
            )}
            {tracking && (
              <span className="font-mono text-xs text-foreground truncate">{tracking}</span>
            )}
          </div>
        );
      },
      size: 160,
      enableSorting: false,
      enableColumnFilter: false,
      meta: { label: "Tracking" },
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
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const pkg = row.original;
        const status = pkg.warehouse_status;
        return (
          <div
            className="flex items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {status === "sent_to_packing" && (
              <>
                <Button intent="primary" size="xs" onPress={() => actions.onScan(pkg)}>
                  <ScanLine data-slot="icon" />
                  Scan
                </Button>
                <Button intent="outline" size="xs" onPress={() => actions.onEdit(pkg)}>
                  <Edit data-slot="icon" />
                </Button>
              </>
            )}
            {status === "packed" && (
              <>
                <Button intent="primary" size="xs" onPress={() => actions.onBookDelivery(pkg)}>
                  <Truck data-slot="icon" />
                  Book
                </Button>
                <Button intent="outline" size="xs" onPress={() => actions.onEdit(pkg)}>
                  <Edit data-slot="icon" />
                </Button>
              </>
            )}
            {(status === "delivery_booked" || status === "shipped") && (
              <Button intent="outline" size="xs" onPress={() => actions.onViewOrder(pkg)}>
                <ExternalLink data-slot="icon" />
              </Button>
            )}
            <Button intent="outline" size="xs" onPress={() => actions.onPrint(pkg)}>
              <Printer data-slot="icon" />
            </Button>
          </div>
        );
      },
      size: 180,
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
    },
  ];
}
