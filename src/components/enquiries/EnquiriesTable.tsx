import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Row } from "@tanstack/react-table";
import { ChevronDown, Plus } from "lucide-react";
import { enquiryService, type Enquiry } from "@/services/enquiryService";
import { useDataTable } from "@/hooks/use-data-table";
import { getEnquiryColumns } from "./enquiries-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import NewEnquiryModal from "@/components/NewEnquiry";
import { cn } from "@/lib/utils";

const OPEN_PAGE_SIZE = 25;
const CLOSED_PAGE_SIZE = 25;
const OPEN_STATUSES = "new,contacted,quoted,negotiating";
const CLOSED_STATUSES = "won,lost,cancelled";

const STATIC_PRIORITY_OPTIONS = [
  { label: "Urgent", value: "urgent" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

// --- Helpers ---

function formatCurrency(value: number | null | undefined): string {
  if (value == null || value === 0) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

// --- Trade Portal Expanded Row ---

function TradePortalExpandedRow({
  row,
  onApprove,
  onDeny,
  actionLoading,
}: {
  row: Row<Enquiry>;
  onApprove: (id: number) => void;
  onDeny: (id: number) => void;
  actionLoading: number | null;
}) {
  const e = row.original;
  const isLoading = actionLoading === e.id;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm">
        <Field label="Contact" value={e.contact_name} />
        <Field label="Company" value={e.company_name} />
        <Field
          label="Email"
          value={
            e.email ? (
              <a
                href={`mailto:${e.email}`}
                className="text-primary hover:underline"
              >
                {e.email}
              </a>
            ) : (
              "-"
            )
          }
        />
        <Field
          label="Phone"
          value={
            e.phone ? (
              <a
                href={`tel:${e.phone}`}
                className="text-primary hover:underline"
              >
                {e.phone}
              </a>
            ) : (
              "-"
            )
          }
        />
        <Field label="Brands of Interest" value={e.product_interest} />
        <Field
          label="Estimated Value"
          value={
            <span className="font-medium">
              {formatCurrency(e.estimated_value)}
            </span>
          }
        />
      </div>
      {e.description && (
        <div>
          <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">
            Notes
          </span>
          <p className="text-sm text-foreground/80 m-0">{e.description}</p>
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-border/40">
        <Button
          intent="primary"
          size="sm"
          onPress={() => onApprove(e.id)}
          isDisabled={isLoading || e.converted_to_customer}
        >
          {e.converted_to_customer ? "Already Approved" : "Approve"}
        </Button>
        <Button
          intent="danger"
          size="sm"
          onPress={() => onDeny(e.id)}
          isDisabled={isLoading || e.status === "cancelled"}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-0.5">
        {label}
      </span>
      <span className="text-foreground">{value || "-"}</span>
    </div>
  );
}

// --- Main Component ---

export default function EnquiriesTable() {
  usePageTitle("Enquiries");
  const navigate = useNavigate();

  // Modal state
  const [showNewModal, setShowNewModal] = useState(false);

  // Approve/Deny loading
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Filter options
  const [statusOptions, setStatusOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);
  const [sourceOptions, setSourceOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);

  // --- Open enquiries ---
  const [openData, setOpenData] = useState<Enquiry[]>([]);
  const [openTotal, setOpenTotal] = useState(0);
  const [openLoading, setOpenLoading] = useState(true);
  const [openFetchKey, setOpenFetchKey] = useState(0);

  const openColumns = useMemo(
    () => getEnquiryColumns(statusOptions, STATIC_PRIORITY_OPTIONS, sourceOptions),
    [statusOptions, sourceOptions],
  );

  const openPageCount = Math.ceil(openTotal / OPEN_PAGE_SIZE);

  const { table: openTable } = useDataTable({
    columns: openColumns,
    data: openData,
    pageCount: openPageCount > 0 ? openPageCount : 1,
    initialState: {
      sorting: [{ id: "created_at", desc: true }],
      pagination: { pageIndex: 0, pageSize: OPEN_PAGE_SIZE },
    },
  });

  const openPagination = openTable.getState().pagination;
  const openSorting = openTable.getState().sorting;
  const openColumnFilters = openTable.getState().columnFilters;

  const openApiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      status: OPEN_STATUSES,
      limit: openPagination.pageSize,
      offset: openPagination.pageIndex * openPagination.pageSize,
    };

    if (openSorting.length > 0) {
      filters.sort_by = openSorting[0].id;
      filters.sort_order = openSorting[0].desc ? "desc" : "asc";
    }

    for (const filter of openColumnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "priority" && Array.isArray(value) && value.length) {
        filters.priority = value.join(",");
      } else if (filter.id === "lead_source" && Array.isArray(value) && value.length) {
        filters.lead_source = value.join(",");
      }
      // Note: status filter in toolbar is hidden for open table since we force OPEN_STATUSES
    }

    return filters;
  }, [openPagination.pageIndex, openPagination.pageSize, openSorting, openColumnFilters]);

  useEffect(() => {
    let cancelled = false;

    async function fetchOpen() {
      setOpenLoading(true);
      try {
        const result = await enquiryService.list(openApiFilters);
        if (cancelled) return;
        setOpenData(result.data);
        setOpenTotal(result.meta?.total ?? result.count);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch open enquiries:", err);
      } finally {
        if (!cancelled) setOpenLoading(false);
      }
    }

    fetchOpen();
    return () => {
      cancelled = true;
    };
  }, [openApiFilters, openFetchKey]);

  // --- Closed enquiries ---
  const [closedOpen, setClosedOpen] = useState(false);
  const [closedEverOpened, setClosedEverOpened] = useState(false);
  const [closedData, setClosedData] = useState<Enquiry[]>([]);
  const [closedTotal, setClosedTotal] = useState(0);
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedFetchKey, setClosedFetchKey] = useState(0);

  const closedColumns = useMemo(
    () => getEnquiryColumns(statusOptions, STATIC_PRIORITY_OPTIONS, sourceOptions),
    [statusOptions, sourceOptions],
  );

  const closedPageCount = Math.ceil(closedTotal / CLOSED_PAGE_SIZE);

  const { table: closedTable } = useDataTable({
    columns: closedColumns,
    data: closedData,
    pageCount: closedPageCount > 0 ? closedPageCount : 1,
    queryKeys: {
      page: "cpage",
      perPage: "cperPage",
      sort: "csort",
      filters: "cfilters",
      joinOperator: "cjo",
    },
    initialState: {
      sorting: [{ id: "created_at", desc: true }],
      pagination: { pageIndex: 0, pageSize: CLOSED_PAGE_SIZE },
    },
  });

  const closedPagination = closedTable.getState().pagination;
  const closedSorting = closedTable.getState().sorting;
  const closedColumnFilters = closedTable.getState().columnFilters;

  const closedApiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      status: CLOSED_STATUSES,
      limit: closedPagination.pageSize,
      offset: closedPagination.pageIndex * closedPagination.pageSize,
    };

    if (closedSorting.length > 0) {
      filters.sort_by = closedSorting[0].id;
      filters.sort_order = closedSorting[0].desc ? "desc" : "asc";
    }

    for (const filter of closedColumnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "priority" && Array.isArray(value) && value.length) {
        filters.priority = value.join(",");
      } else if (filter.id === "lead_source" && Array.isArray(value) && value.length) {
        filters.lead_source = value.join(",");
      }
    }

    return filters;
  }, [closedPagination.pageIndex, closedPagination.pageSize, closedSorting, closedColumnFilters]);

  // Lazy-load: only start fetching closed when first opened
  useEffect(() => {
    if (closedOpen && !closedEverOpened) {
      setClosedEverOpened(true);
    }
  }, [closedOpen, closedEverOpened]);

  useEffect(() => {
    if (!closedEverOpened) return;
    let cancelled = false;

    async function fetchClosed() {
      setClosedLoading(true);
      try {
        const result = await enquiryService.list(closedApiFilters);
        if (cancelled) return;
        setClosedData(result.data);
        setClosedTotal(result.meta?.total ?? result.count);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch closed enquiries:", err);
      } finally {
        if (!cancelled) setClosedLoading(false);
      }
    }

    fetchClosed();
    return () => {
      cancelled = true;
    };
  }, [closedApiFilters, closedEverOpened, closedFetchKey]);

  // Fetch closed count even before opening (for the badge)
  useEffect(() => {
    async function fetchClosedCount() {
      try {
        const result = await enquiryService.list({
          status: CLOSED_STATUSES,
          limit: 0,
          offset: 0,
        });
        setClosedTotal(result.meta?.total ?? result.count);
      } catch {
        // silent
      }
    }
    fetchClosedCount();
  }, [closedFetchKey]);

  // --- Filter options ---
  useEffect(() => {
    async function fetchOptions() {
      try {
        const sources = await enquiryService.getLeadSources();
        setSourceOptions(
          sources.map((s) => ({
            label: s.lead_source
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            value: s.lead_source,
            count: s.count,
          })),
        );
      } catch (err) {
        console.error("Failed to fetch filter options:", err);
      }
    }
    fetchOptions();
  }, []);

  // Build status options from the open statuses only (for the open table filter)
  useEffect(() => {
    setStatusOptions([
      { label: "New", value: "new" },
      { label: "Contacted", value: "contacted" },
      { label: "Quoted", value: "quoted" },
      { label: "Negotiating", value: "negotiating" },
      { label: "Won", value: "won" },
      { label: "Lost", value: "lost" },
      { label: "Cancelled", value: "cancelled" },
    ]);
  }, []);

  // --- Row click ---
  const handleOpenRowClick = useCallback(
    (enquiry: Enquiry, row: Row<Enquiry>) => {
      if (enquiry.lead_source === "trade_portal") {
        row.toggleExpanded();
        return;
      }
      navigate(`/enquiries/${enquiry.id}`);
    },
    [navigate],
  );

  const handleClosedRowClick = useCallback(
    (enquiry: Enquiry) => {
      navigate(`/enquiries/${enquiry.id}`);
    },
    [navigate],
  );

  // --- Approve / Deny ---
  const refetch = useCallback(() => {
    setOpenFetchKey((k) => k + 1);
    setClosedFetchKey((k) => k + 1);
  }, []);

  const handleApprove = useCallback(
    async (id: number) => {
      setActionLoading(id);
      try {
        await enquiryService.approve(id);
        refetch();
      } catch (err) {
        console.error("Failed to approve enquiry:", err);
      } finally {
        setActionLoading(null);
      }
    },
    [refetch],
  );

  const handleDeny = useCallback(
    async (id: number) => {
      setActionLoading(id);
      try {
        await enquiryService.updateStatus(id, "cancelled");
        refetch();
      } catch (err) {
        console.error("Failed to deny enquiry:", err);
      } finally {
        setActionLoading(null);
      }
    },
    [refetch],
  );

  // --- Render ---

  const renderSubComponent = useCallback(
    ({ row }: { row: Row<Enquiry> }) => (
      <TradePortalExpandedRow
        row={row}
        onApprove={handleApprove}
        onDeny={handleDeny}
        actionLoading={actionLoading}
      />
    ),
    [handleApprove, handleDeny, actionLoading],
  );

  return (
    <div>
      <PageHeader
        title="Enquiries"
        actions={
          <Button
            intent="primary"
            size="sm"
            onPress={() => setShowNewModal(true)}
          >
            <Plus data-slot="icon" />
            New Enquiry
          </Button>
        }
      />

      {/* Open Enquiries */}
      {openLoading && openData.length === 0 ? (
        <DataTableSkeleton
          columnCount={10}
          rowCount={10}
          filterCount={3}
          cellWidths={[
            "32px",
            "40px",
            "180px",
            "180px",
            "200px",
            "130px",
            "110px",
            "130px",
            "110px",
            "120px",
          ]}
        />
      ) : (
        <DataTable
          table={openTable}
          onRowClick={handleOpenRowClick}
          renderSubComponent={renderSubComponent}
        >
          <DataTableToolbar table={openTable} />
        </DataTable>
      )}

      {/* Closed Enquiries */}
      <div className="mt-6">
        <Collapsible open={closedOpen} onOpenChange={setClosedOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 px-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronDown
              size={16}
              className={cn(
                "transition-transform duration-200",
                closedOpen && "rotate-180",
              )}
            />
            <span>Closed Enquiries</span>
            {closedTotal > 0 && (
              <span className="text-xs text-muted-foreground/60 ml-1">
                ({closedTotal})
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {closedLoading && closedData.length === 0 ? (
              <DataTableSkeleton
                columnCount={10}
                rowCount={5}
                filterCount={2}
                cellWidths={[
                  "32px",
                  "40px",
                  "180px",
                  "180px",
                  "200px",
                  "130px",
                  "110px",
                  "130px",
                  "110px",
                  "120px",
                ]}
              />
            ) : (
              <DataTable table={closedTable} onRowClick={handleClosedRowClick}>
                <DataTableToolbar table={closedTable} />
              </DataTable>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* New Enquiry Modal */}
      <NewEnquiryModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={() => {
          setShowNewModal(false);
          refetch();
        }}
      />
    </div>
  );
}
