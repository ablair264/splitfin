import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { JournalPost } from "@/types/domain";

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Archived", value: "archived" },
];

const FEATURED_OPTIONS = [
  { label: "Featured", value: "true" },
  { label: "Not Featured", value: "false" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getJournalPostColumns(onDelete?: (post: JournalPost) => void): ColumnDef<JournalPost>[] {
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
      accessorFn: (row) => row.title,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Title" />
      ),
      cell: ({ row }) => {
        const post = row.original;
        return (
          <div className="flex items-center gap-3 min-w-0">
            {post.cover_image ? (
              <img
                src={post.cover_image}
                alt=""
                className="size-8 shrink-0 rounded object-cover bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="size-8 shrink-0 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                J
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground" title={post.title}>
                {post.title}
              </div>
              <div className="text-xs text-muted-foreground font-mono">{post.slug}</div>
            </div>
          </div>
        );
      },
      size: 300,
      enableColumnFilter: true,
      meta: {
        label: "Title",
        placeholder: "Search posts...",
        variant: "text" as const,
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Status" />
      ),
      cell: ({ row }) => {
        const status = row.original.status;
        const styles: Record<string, string> = {
          draft: "bg-muted text-muted-foreground border-border",
          published: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          archived: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        };
        return (
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || ""}`}>
            {status}
          </span>
        );
      },
      size: 100,
      enableColumnFilter: true,
      meta: {
        label: "Status",
        variant: "select" as const,
        options: STATUS_OPTIONS,
      },
    },
    {
      id: "author",
      accessorKey: "author",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Author" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate block">
          {row.original.author}
        </span>
      ),
      size: 130,
      enableColumnFilter: false,
      meta: { label: "Author" },
    },
    {
      id: "tags",
      accessorFn: (row) => row.tags?.map((t) => t.name).join(", ") || "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Tags" />
      ),
      cell: ({ row }) => {
        const tags = row.original.tags;
        if (!tags || tags.length === 0) return <span className="text-xs text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {t.name}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>
            )}
          </div>
        );
      },
      size: 160,
      enableSorting: false,
      enableColumnFilter: false,
      meta: { label: "Tags" },
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
      id: "published_at",
      accessorKey: "published_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Published" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDate(row.original.published_at)}
        </span>
      ),
      size: 120,
      enableColumnFilter: false,
      meta: { label: "Published" },
    },
    ...(onDelete
      ? [
          {
            id: "actions",
            header: () => null,
            cell: ({ row }: { row: { original: JournalPost } }) => (
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onDelete(row.original);
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete post"
              >
                <Trash2 size={14} />
              </button>
            ),
            size: 50,
            enableSorting: false,
            enableColumnFilter: false,
          } as ColumnDef<JournalPost>,
        ]
      : []),
  ];
}
