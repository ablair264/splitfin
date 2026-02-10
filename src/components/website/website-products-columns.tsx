import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { formatBrand } from "@/lib/format";
import type { WebsiteProduct } from "@/types/domain";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(value);
}

const BADGE_OPTIONS = [
  { label: "New", value: "new" },
  { label: "Sale", value: "sale" },
];

const FEATURED_OPTIONS = [
  { label: "Featured", value: "true" },
  { label: "Not Featured", value: "false" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

export function getWebsiteProductColumns(
  brandOptions: { label: string; value: string; count?: number }[],
  categoryOptions: { label: string; value: string }[],
): ColumnDef<WebsiteProduct>[] {
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
      accessorFn: (row) => row.display_name || row.base_name || "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Product" />
      ),
      cell: ({ row }) => {
        const wp = row.original;
        const primaryImage = wp.images?.find((img) => img.is_primary) || wp.images?.[0];
        return (
          <div className="flex items-center gap-3 min-w-0">
            {primaryImage?.image_url ? (
              <img
                src={primaryImage.image_url}
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
              <div className="truncate text-sm font-medium text-foreground" title={wp.display_name || wp.base_name || ""}>
                {wp.display_name || wp.base_name}
              </div>
              <div className="text-xs text-muted-foreground font-mono">{wp.sku}</div>
            </div>
          </div>
        );
      },
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
          {row.original.brand ? formatBrand(row.original.brand) : "-"}
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
      id: "retail_price",
      accessorKey: "retail_price",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Retail" />
      ),
      cell: ({ row }) => (
        <div className="tabular-nums">
          <span className="text-sm font-semibold text-foreground">
            {formatCurrency(row.original.retail_price)}
          </span>
          {row.original.compare_at_price && (
            <span className="text-xs text-muted-foreground line-through ml-1.5">
              {formatCurrency(row.original.compare_at_price)}
            </span>
          )}
        </div>
      ),
      size: 120,
      enableColumnFilter: false,
      meta: { label: "Retail" },
    },
    {
      id: "category",
      accessorFn: (row) => row.category_name || "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Category" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate block">
          {row.original.category_name || "-"}
        </span>
      ),
      size: 130,
      enableColumnFilter: true,
      meta: {
        label: "Category",
        variant: "multiSelect" as const,
        options: categoryOptions,
      },
    },
    {
      id: "badge",
      accessorKey: "badge",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Badge" />
      ),
      cell: ({ row }) => {
        const badge = row.original.badge;
        if (!badge) return <span className="text-xs text-muted-foreground">-</span>;
        return (
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
              badge === "new"
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            }`}
          >
            {badge === "new" ? "New" : "Sale"}
          </span>
        );
      },
      size: 80,
      enableColumnFilter: true,
      meta: {
        label: "Badge",
        variant: "select" as const,
        options: BADGE_OPTIONS,
      },
    },
    {
      id: "is_featured",
      accessorFn: (row) => row.is_featured,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Featured" />
      ),
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
            row.original.is_featured
              ? "bg-primary/20 text-primary border-primary/30"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          {row.original.is_featured ? "Yes" : "No"}
        </span>
      ),
      size: 80,
      enableColumnFilter: true,
      meta: {
        label: "Featured",
        variant: "select" as const,
        options: FEATURED_OPTIONS,
      },
    },
    {
      id: "stock_on_hand",
      accessorFn: (row) => row.stock_on_hand ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock" />
      ),
      cell: ({ row }) => {
        const stock = row.original.stock_on_hand ?? 0;
        const color =
          stock === 0
            ? "text-red-400 bg-red-500/20 border-red-500/30"
            : stock <= 5
              ? "text-amber-400 bg-amber-500/20 border-amber-500/30"
              : "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
        return (
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}>
            {stock}
          </span>
        );
      },
      size: 80,
      enableColumnFilter: false,
      meta: { label: "Stock" },
    },
    {
      id: "is_active",
      accessorFn: (row) => row.is_active,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Status" />
      ),
      cell: ({ row }) => {
        const active = row.original.is_active;
        return (
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
              active
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
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
