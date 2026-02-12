import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoiceService } from "@/services/invoiceService";
import type { Invoice, InvoiceSummary } from "@/types/domain";
import { useDataTable } from "@/hooks/use-data-table";
import { getInvoiceColumns } from "./invoices-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PoundSterling, AlertTriangle, Clock } from "lucide-react";

const PAGE_SIZE = 50;

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

function SummaryPills({ summary }: { summary: InvoiceSummary | null }) {
  if (!summary) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <PoundSterling size={14} className="text-primary" />
        <div className="text-xs">
          <span className="text-muted-foreground">Total Invoiced</span>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {formatCurrency(summary.total_invoiced)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <Clock size={14} className="text-orange-400" />
        <div className="text-xs">
          <span className="text-muted-foreground">Outstanding</span>
          <p className="text-sm font-semibold text-orange-400 tabular-nums">
            {formatCurrency(summary.total_outstanding)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <AlertTriangle size={14} className="text-red-400" />
        <div className="text-xs">
          <span className="text-muted-foreground">Overdue ({summary.overdue_count})</span>
          <p className="text-sm font-semibold text-red-400 tabular-nums">
            {formatCurrency(summary.total_overdue)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesTable() {
  usePageTitle("Invoices");
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [statusOptions, setStatusOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);
  const [salespersonOptions, setSalespersonOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);

  const columns = useMemo(
    () => getInvoiceColumns(statusOptions, salespersonOptions),
    [statusOptions, salespersonOptions]
  );

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: invoices,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "invoice_date" as keyof Invoice, desc: true }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
      columnVisibility: {},
    },
  });

  const pagination = table.getState().pagination;
  const sorting = table.getState().sorting;
  const columnFilters = table.getState().columnFilters;

  // Build cross-filter params for cascading filter options
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
        base.salesperson_name = value.join(",");
      }
    }
    return base;
  }, [columnFilters]);

  // Re-fetch filter options when cross-filters change
  useEffect(() => {
    async function fetchFilterOptions() {
      try {
        const { status: _s, ...statusFilters } = crossFilters;
        const { salesperson_name: _sp, ...salespersonFilters } = crossFilters;

        const [statuses, salespersons] = await Promise.all([
          invoiceService.getStatuses(Object.keys(statusFilters).length > 0 ? statusFilters : undefined),
          invoiceService.getSalespersons(Object.keys(salespersonFilters).length > 0 ? salespersonFilters : undefined),
        ]);
        setStatusOptions(
          statuses.map((s) => ({
            label: s.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
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
        console.error("Failed to fetch invoice filter options:", err);
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

    if (sorting.length > 0) {
      filters.sort_by = sorting[0].id;
      filters.sort_order = sorting[0].desc ? "desc" : "asc";
    }

    for (const filter of columnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "status" && Array.isArray(value) && value.length) {
        filters.status = value.join(",");
      } else if (filter.id === "salesperson_name" && Array.isArray(value) && value.length) {
        filters.salesperson_name = value.join(",");
      }
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

  // Fetch data whenever filters change
  useEffect(() => {
    let cancelled = false;

    async function fetchInvoices() {
      setLoading(true);
      try {
        const [result, summaryResult] = await Promise.all([
          invoiceService.list(apiFilters),
          invoiceService.getSummary(
            Object.fromEntries(
              Object.entries(apiFilters)
                .filter(([k]) => !["limit", "offset", "sort_by", "sort_order"].includes(k))
                .map(([k, v]) => [k, String(v)])
            )
          ),
        ]);
        if (cancelled) return;
        setInvoices(result.data);
        setTotalCount(result.meta?.total ?? result.count);
        setSummary(summaryResult);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch invoices:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInvoices();
    return () => { cancelled = true; };
  }, [apiFilters]);

  const handleRowClick = useCallback(
    (row: Invoice) => navigate(`/finance/invoices/${row.id}`),
    [navigate]
  );

  if (loading && invoices.length === 0) {
    return (
      <div>
        <PageHeader title="Invoices" />
        <DataTableSkeleton
          columnCount={9}
          rowCount={10}
          filterCount={3}
          cellWidths={["40px", "140px", "220px", "130px", "130px", "140px", "150px", "110px", "120px"]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Invoices" />
      <SummaryPills summary={summary} />
      <DataTable table={table} onRowClick={handleRowClick}>
        <DataTableToolbar table={table} />
      </DataTable>
    </div>
  );
}
