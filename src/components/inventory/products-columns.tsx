import type { ColumnDef } from "@tanstack/react-table";
import { Globe, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { Product } from "@/types/domain";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(value);
}

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) {
    return (
      <span className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
        0
      </span>
    );
  }
  if (stock <= 5) {
    return (
      <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
        {stock}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
      {stock}
    </span>
  );
}

const STOCK_OPTIONS = [
  { label: "In Stock", value: "in-stock" },
  { label: "Low Stock", value: "low-stock" },
  { label: "Out of Stock", value: "out-of-stock" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

export function getProductColumns(
  brandOptions: { label: string; value: string; count?: number }[],
): ColumnDef<Product>[] {
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
      accessorFn: (row) => row.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Product" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3 min-w-0">
          {row.original.image_url ? (
            <img
              src={row.original.image_url}
              alt=""
              className="size-8 shrink-0 rounded object-cover bg-muted"
              loading="lazy"
            />
          ) : (
            <div className="size-8 shrink-0 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
              IMG
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground" title={row.original.name}>
              {row.original.name}
            </div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.sku}</div>
          </div>
        </div>
      ),
      size: 280,
      enableColumnFilter: true,
      meta: {
        label: "Product",
        placeholder: "Search products...",
        variant: "text" as const,
      },
    },
    {
      id: "brand",
      accessorKey: "brand",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Brand" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate block">
          {row.original.brand || "-"}
        </span>
      ),
      size: 140,
      enableColumnFilter: true,
      meta: {
        label: "Brand",
        variant: "multiSelect" as const,
        options: brandOptions,
      },
    },
    {
      id: "stock_on_hand",
      accessorKey: "stock_on_hand",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock" />
      ),
      cell: ({ row }) => (
        <StockBadge stock={row.original.stock_on_hand} />
      ),
      size: 80,
      enableColumnFilter: true,
      meta: {
        label: "Stock",
        variant: "select" as const,
        options: STOCK_OPTIONS,
      },
    },
    {
      id: "cost_price",
      accessorFn: (row) => row.cost_price,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cost" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatCurrency(row.original.cost_price)}
        </span>
      ),
      size: 90,
      enableColumnFilter: false,
      meta: { label: "Cost" },
    },
    {
      id: "rate",
      accessorKey: "rate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Price" />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatCurrency(row.original.rate)}
        </span>
      ),
      size: 90,
      enableColumnFilter: false,
      meta: { label: "Price" },
    },
    {
      id: "badges",
      accessorFn: () => null,
      header: () => <span className="text-xs font-medium text-muted-foreground">Badges</span>,
      cell: ({ row }) => {
        const onWebsite = row.original.on_website;
        const lowStock = row.original.stock_on_hand <= 10 && row.original.status === "active";
        if (!onWebsite && !lowStock) return null;
        return (
          <div className="flex flex-wrap gap-1">
            {onWebsite && (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                <Globe size={10} /> Live
              </span>
            )}
            {lowStock && (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                <AlertTriangle size={10} /> Reorder
              </span>
            )}
          </div>
        );
      },
      size: 120,
      enableSorting: false,
      enableColumnFilter: false,
      meta: { label: "Badges" },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Status" />
      ),
      cell: ({ row }) => {
        const active = row.original.status === "active";
        return (
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
            active
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-muted text-muted-foreground border-border"
          }`}>
            {active ? "Active" : "Inactive"}
          </span>
        );
      },
      size: 90,
      enableColumnFilter: true,
      meta: {
        label: "Status",
        variant: "select" as const,
        options: STATUS_OPTIONS,
      },
    },
  ];
}
