import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { orderService } from "@/services/orderService";
import type { Order } from "@/types/domain";
import { useDataTable } from "@/hooks/use-data-table";
import { getOrderColumns } from "./orders-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";

const PAGE_SIZE = 50;

export default function OrdersTable() {
  usePageTitle("Orders");
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusOptions, setStatusOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);
  const [salespersonOptions, setSalespersonOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);

  const columns = useMemo(
    () => getOrderColumns(statusOptions, salespersonOptions),
    [statusOptions, salespersonOptions]
  );

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: orders,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "date", desc: true }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
      columnVisibility: {},
    },
  });

  // Extract current table state for API calls
  const pagination = table.getState().pagination;
  const sorting = table.getState().sorting;
  const columnFilters = table.getState().columnFilters;

  // Build cross-filter params for cascading filter option fetches
  const crossFilters = useMemo(() => {
    const base: Record<string, string> = {};
    for (const filter of columnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        base.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        base.search = value[0];
      } else if (filter.id === "status" && Array.isArray(value) && value.length) {
        base.status = value.join(",");
      } else if (filter.id === "salesperson_name" && Array.isArray(value) && value.length) {
        base.salesperson_name = value[0];
      }
    }
    return base;
  }, [columnFilters]);

  // Re-fetch filter options when cross-filters change (cascading filters)
  useEffect(() => {
    async function fetchFilterOptions() {
      try {
        // For status options: pass all filters EXCEPT status
        const { status: _s, ...statusFilters } = crossFilters;
        // For salesperson options: pass all filters EXCEPT salesperson_name
        const { salesperson_name: _sp, ...salespersonFilters } = crossFilters;

        const [statuses, salespersons] = await Promise.all([
          orderService.getStatuses(Object.keys(statusFilters).length > 0 ? statusFilters : undefined),
          orderService.getSalespersons(Object.keys(salespersonFilters).length > 0 ? salespersonFilters : undefined),
        ]);
        setStatusOptions(
          statuses.map((s) => ({
            label: s.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            value: s.status,
            count: Number(s.count),
          }))
        );
        setSalespersonOptions(
          salespersons.map((s) => ({
            label: s.salesperson_name,
            value: s.salesperson_name,
            count: Number(s.count),
          }))
        );
      } catch (err) {
        console.error("Failed to fetch filter options:", err);
      }
    }
    fetchFilterOptions();
  }, [crossFilters]);

  // Build API filters from table state
  const apiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    };

    // Sorting
    if (sorting.length > 0) {
      filters.sort_by = sorting[0].id;
      filters.sort_order = sorting[0].desc ? "desc" : "asc";
    }

    // Column filters
    for (const filter of columnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "status" && Array.isArray(value) && value.length) {
        filters.status = value.join(",");
      } else if (filter.id === "salesperson_name" && Array.isArray(value) && value.length) {
        filters.salesperson_name = value[0];
      }
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

  // Fetch data whenever filters change
  useEffect(() => {
    let cancelled = false;

    async function fetchOrders() {
      setLoading(true);
      try {
        const result = await orderService.list(apiFilters);
        if (cancelled) return;
        setOrders(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch orders:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOrders();
    return () => { cancelled = true; };
  }, [apiFilters]);

  const handleRowClick = useCallback(
    (row: Order) => navigate(`/order/${row.id}`),
    [navigate]
  );

  if (loading && orders.length === 0) {
    return (
      <div>
        <PageHeader title="Orders" />
        <DataTableSkeleton
          columnCount={7}
          rowCount={10}
          filterCount={3}
          cellWidths={["40px", "130px", "220px", "140px", "120px", "140px", "110px"]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Orders" />
      <DataTable table={table} onRowClick={handleRowClick}>
        <DataTableToolbar table={table} />
      </DataTable>
    </div>
  );
}
