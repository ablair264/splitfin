import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  warehouseService,
  type Package,
  type PackageListItem,
} from "@/services/warehouseService";
import { useDataTable } from "@/hooks/use-data-table";
import { getPackingListColumns, type PackingListActions } from "./packing-lists-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PackingScanModal } from "@/components/warehouse/PackingScanModal";
import { ShippingBookingModal } from "@/components/warehouse/ShippingBookingModal";
import { PackingListEditModal } from "@/components/warehouse/PackingListEditModal";
import { triggerPackingListPrint } from "@/components/warehouse/PackingListPrint";

const PAGE_SIZE = 50;

export default function PackingListsPage() {
  usePageTitle("Packing Lists");
  const navigate = useNavigate();

  const [packages, setPackages] = useState<PackageListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusOptions, setStatusOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);

  // Modal state
  const [scanPkg, setScanPkg] = useState<Package | null>(null);
  const [bookingPkg, setBookingPkg] = useState<Package | null>(null);
  const [editPkg, setEditPkg] = useState<Package | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Action handlers — fetch full package before opening modals
  const openModal = useCallback(
    async (
      pkg: PackageListItem,
      setter: (p: Package | null) => void,
    ) => {
      try {
        const full = await warehouseService.getPackage(pkg.id);
        setter(full);
      } catch {
        // Fallback: construct a minimal Package from the list item
        setter({
          id: pkg.id,
          packing_number: pkg.packing_number,
          warehouse_status: pkg.warehouse_status,
          status: pkg.status,
          salesorder_number: pkg.salesorder_number,
          customer_name: pkg.customer_name,
          order_total: pkg.order_total,
          order_id: pkg.order_id,
          carrier_name: pkg.carrier_name,
          tracking_number: pkg.tracking_number,
          expected_delivery_date: null,
          sent_to_packing_at: pkg.sent_to_packing_at,
          packed_at: pkg.packed_at,
          delivery_booked_at: pkg.delivery_booked_at,
          created_at: pkg.created_at,
          updated_at: pkg.updated_at,
          items: [],
        });
      }
    },
    [],
  );

  const actions: PackingListActions = useMemo(
    () => ({
      onScan: (pkg) => openModal(pkg, setScanPkg),
      onEdit: (pkg) => openModal(pkg, setEditPkg),
      onBookDelivery: (pkg) => openModal(pkg, setBookingPkg),
      onPrint: async (pkg) => {
        try {
          const full = await warehouseService.getPackage(pkg.id);
          triggerPackingListPrint(full);
        } catch {
          triggerPackingListPrint({
            id: pkg.id,
            packing_number: pkg.packing_number,
            warehouse_status: pkg.warehouse_status,
            status: pkg.status,
            salesorder_number: pkg.salesorder_number,
            customer_name: pkg.customer_name,
            order_total: pkg.order_total,
            order_id: pkg.order_id,
            carrier_name: pkg.carrier_name,
            tracking_number: pkg.tracking_number,
            expected_delivery_date: null,
            sent_to_packing_at: pkg.sent_to_packing_at,
            packed_at: pkg.packed_at,
            delivery_booked_at: pkg.delivery_booked_at,
            created_at: pkg.created_at,
            updated_at: pkg.updated_at,
            items: [],
          });
        }
      },
      onViewOrder: (pkg) => navigate(`/order/${pkg.order_id}`),
    }),
    [navigate, openModal],
  );

  const columns = useMemo(
    () => getPackingListColumns(statusOptions, actions),
    [statusOptions, actions],
  );

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: packages,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "created_at", desc: true }],
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
      } else if (filter.id === "warehouse_status" && Array.isArray(value) && value.length) {
        base.warehouse_status = value.join(",");
      }
    }
    return base;
  }, [columnFilters]);

  // Fetch status filter options (cascading)
  useEffect(() => {
    async function fetchStatusOptions() {
      try {
        const statuses = await warehouseService.getStatuses();
        setStatusOptions(
          statuses.map((s) => ({
            label: s.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            value: s.status,
            count: Number(s.count),
          })),
        );
      } catch (err) {
        console.error("Failed to fetch status options:", err);
      }
    }
    fetchStatusOptions();
  }, [crossFilters, refreshKey]);

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
    let hasStatusFilter = false;
    for (const filter of columnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "warehouse_status" && Array.isArray(value) && value.length) {
        filters.warehouse_status = (value as string[]).join(",");
        hasStatusFilter = true;
      }
    }

    // Default to packing-stage statuses only (exclude shipped/delivered)
    if (!hasStatusFilter) {
      filters.warehouse_status = "sent_to_packing,packed,delivery_booked";
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

  // Fetch data whenever filters change
  useEffect(() => {
    let cancelled = false;

    async function fetchPackages() {
      setLoading(true);
      try {
        const result = await warehouseService.list(apiFilters);
        if (cancelled) return;
        setPackages(result.data);
        setTotalCount(result.meta?.total ?? 0);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch packages:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPackages();
    return () => {
      cancelled = true;
    };
  }, [apiFilters, refreshKey]);

  const handleModalSuccess = useCallback(() => {
    setScanPkg(null);
    setBookingPkg(null);
    setEditPkg(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleRowClick = useCallback(
    (row: PackageListItem) => {
      // Open scan modal for sent_to_packing, booking for packed, otherwise view order
      if (row.warehouse_status === "sent_to_packing") {
        openModal(row, setScanPkg);
      } else if (row.warehouse_status === "packed") {
        openModal(row, setBookingPkg);
      } else {
        navigate(`/order/${row.order_id}`);
      }
    },
    [navigate, openModal],
  );

  if (loading && packages.length === 0) {
    return (
      <div>
        <PageHeader
          title="Packing Lists"
          breadcrumbs={[
            { label: "Shipping", href: "/shipping" },
            { label: "Packing Lists" },
          ]}
        />
        <DataTableSkeleton
          columnCount={8}
          rowCount={10}
          filterCount={2}
          cellWidths={["140px", "130px", "200px", "80px", "150px", "160px", "120px", "180px"]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Packing Lists"
        count={totalCount}
        subtitle="packages"
        breadcrumbs={[
          { label: "Shipping", href: "/shipping" },
          { label: "Packing Lists" },
        ]}
      />
      <DataTable table={table} onRowClick={handleRowClick}>
        <DataTableToolbar table={table} />
      </DataTable>

      {/* Modals */}
      {scanPkg && (
        <PackingScanModal
          pkg={scanPkg}
          open={!!scanPkg}
          onClose={() => setScanPkg(null)}
          onSuccess={handleModalSuccess}
        />
      )}
      {bookingPkg && (
        <ShippingBookingModal
          pkg={bookingPkg}
          open={!!bookingPkg}
          onClose={() => setBookingPkg(null)}
          onSuccess={handleModalSuccess}
        />
      )}
      {editPkg && (
        <PackingListEditModal
          pkg={editPkg}
          open={!!editPkg}
          onClose={() => setEditPkg(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
