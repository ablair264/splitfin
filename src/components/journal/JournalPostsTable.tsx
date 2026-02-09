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

  const columns = useMemo(() => getJournalPostColumns(), []);

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
  }, [apiFilters]);

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
    </div>
  );
}
