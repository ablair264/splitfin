import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { journalPostService } from "@/services/journalPostService";
import type { JournalPost } from "@/types/domain";
import { useDataTable } from "@/hooks/use-data-table";
import { getJournalPostColumns } from "./journal-posts-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

export default function JournalPostsTable() {
  usePageTitle("Journal");

  const navigate = useNavigate();
  const [posts, setPosts] = useState<JournalPost[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<JournalPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await journalPostService.remove(deleteTarget.id);
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to delete post:", err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const columns = useMemo(
    () => getJournalPostColumns((post) => setDeleteTarget(post)),
    []
  );

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: posts,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "published_at" as keyof JournalPost, desc: true }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
    },
  });

  const pagination = table.getState().pagination;
  const sorting = table.getState().sorting;
  const columnFilters = table.getState().columnFilters;

  const sortColumnMap: Record<string, string> = {
    search: "title",
    status: "status",
    published_at: "published_at",
    is_featured: "display_order",
  };

  const apiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    };

    if (sorting.length > 0) {
      filters.sort_by = sortColumnMap[sorting[0].id] || "created_at";
      filters.sort_order = sorting[0].desc ? "desc" : "asc";
    }

    for (const filter of columnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "status" && Array.isArray(value) && value.length) {
        filters.status = value[0];
      } else if (filter.id === "is_featured" && Array.isArray(value) && value.length) {
        filters.is_featured = value[0];
      }
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPosts() {
      setLoading(true);
      try {
        const result = await journalPostService.list(apiFilters);
        if (cancelled) return;
        setPosts(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch journal posts:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPosts();
    return () => { cancelled = true; };
  }, [apiFilters, refreshKey]);

  const handleRowClick = useCallback((row: JournalPost) => {
    navigate(`/website/journal/${row.id}`);
  }, [navigate]);

  if (loading && posts.length === 0) {
    return (
      <div>
        <PageHeader title="Journal" />
        <DataTableSkeleton
          columnCount={7}
          rowCount={10}
          filterCount={3}
          cellWidths={["40px", "300px", "100px", "130px", "160px", "80px", "120px"]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle={`${totalCount} post${totalCount !== 1 ? "s" : ""}`}
        actions={
          <Button intent="primary" size="sm" onPress={() => navigate("/website/journal/new")}>
            <Plus size={14} className="mr-1.5" /> New Post
          </Button>
        }
      />
      <DataTable table={table} onRowClick={handleRowClick}>
        <DataTableToolbar table={table} />
      </DataTable>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative z-50 w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">Delete post?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete <strong>{deleteTarget.title}</strong> and all its images. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
