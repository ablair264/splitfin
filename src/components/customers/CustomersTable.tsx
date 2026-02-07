import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { customerService } from "@/services/customerService";
import type { Customer } from "@/types/domain";
import { useDataTable } from "@/hooks/use-data-table";
import { getCustomerColumns } from "./customers-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";

const PAGE_SIZE = 25;

export default function CustomersTable() {
  usePageTitle("Customers");
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const columns = useMemo(() => getCustomerColumns(), []);

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: customers,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "company_name" as keyof Customer, desc: false }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
    },
  });

  const pagination = table.getState().pagination;
  const sorting = table.getState().sorting;
  const columnFilters = table.getState().columnFilters;

  // Map column sort IDs to API sort_by values
  const sortColumnMap: Record<string, string> = {
    search: "company_name",
    total_spent: "total_spent",
    outstanding_receivable: "outstanding_receivable",
    last_order_date: "last_order_date",
    region: "location_region",
    payment_terms_label: "payment_terms_label",
    segment: "segment",
  };

  const apiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      status: "active",
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    };

    if (sorting.length > 0) {
      filters.sort_by = sortColumnMap[sorting[0].id] || "company_name";
      filters.sort_order = sorting[0].desc ? "desc" : "asc";
    }

    for (const filter of columnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "region" && Array.isArray(value) && value.length) {
        filters.region = value.join(",");
      } else if (filter.id === "payment_terms_label" && Array.isArray(value) && value.length) {
        filters.payment_terms = value[0];
      } else if (filter.id === "segment" && Array.isArray(value) && value.length) {
        filters.segment = value[0];
      }
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCustomers() {
      setLoading(true);
      try {
        const result = await customerService.list(apiFilters);
        if (cancelled) return;
        setCustomers(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch customers:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCustomers();
    return () => { cancelled = true; };
  }, [apiFilters]);

  const handleRowClick = useCallback(
    (row: Customer) => navigate(`/customers/${row.id}`),
    [navigate]
  );

  if (loading && customers.length === 0) {
    return (
      <div>
        <PageHeader title="Customers" count={0} subtitle="customers" />
        <DataTableSkeleton
          columnCount={9}
          rowCount={10}
          filterCount={4}
          cellWidths={["40px", "220px", "220px", "120px", "100px", "100px", "110px", "110px", "90px"]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Customers" count={totalCount} subtitle="customers" />
      <DataTable table={table} onRowClick={handleRowClick}>
        <DataTableToolbar table={table} />
      </DataTable>
    </div>
  );
}
