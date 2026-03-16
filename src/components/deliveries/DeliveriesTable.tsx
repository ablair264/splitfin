import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import {
  warehouseService,
  type PackageListItem,
} from "@/services/warehouseService";
import { trackingService, type TrackingInfo } from "@/services/trackingService";
import { useDataTable } from "@/hooks/use-data-table";
import { getDeliveryColumns } from "./deliveries-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Truck, MapPin, Clock, CheckCircle, ExternalLink, RefreshCw, Package, X } from "lucide-react";

const PAGE_SIZE = 50;
const DELIVERY_STATUSES = "delivery_booked,shipped,delivered";

export default function DeliveriesTable() {
  usePageTitle("Deliveries");
  const navigate = useNavigate();

  const [packages, setPackages] = useState<PackageListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusOptions, setStatusOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);

  // Tracking modal
  const [trackingPkg, setTrackingPkg] = useState<PackageListItem | null>(null);
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Stats
  const stats = useMemo(() => {
    const s = { total: totalCount, booked: 0, shipped: 0, delivered: 0 };
    statusOptions.forEach((o) => {
      if (o.value === "delivery_booked") s.booked = o.count ?? 0;
      if (o.value === "shipped") s.shipped = o.count ?? 0;
      if (o.value === "delivered") s.delivered = o.count ?? 0;
    });
    return s;
  }, [totalCount, statusOptions]);

  const columns = useMemo(
    () => getDeliveryColumns(statusOptions),
    [statusOptions],
  );

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: packages,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "delivery_booked_at", desc: true }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
      columnVisibility: {},
    },
  });

  // Extract table state
  const pagination = table.getState().pagination;
  const sorting = table.getState().sorting;
  const columnFilters = table.getState().columnFilters;

  // Build API filters
  const apiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    };

    if (sorting.length > 0) {
      filters.sort_by = sorting[0].id;
      filters.sort_order = sorting[0].desc ? "desc" : "asc";
    }

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
    if (!hasStatusFilter) {
      filters.warehouse_status = DELIVERY_STATUSES;
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

  // Fetch status options
  useEffect(() => {
    warehouseService.getStatuses().then((data) => {
      const deliveryStatuses = data.filter((s) =>
        ["delivery_booked", "shipped", "delivered"].includes(s.status),
      );
      setStatusOptions(
        deliveryStatuses.map((s) => ({
          label: s.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          value: s.status,
          count: Number(s.count),
        })),
      );
    });
  }, []);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const result = await warehouseService.list(apiFilters);
        if (cancelled) return;
        setPackages(result.data);
        setTotalCount(result.meta?.total ?? 0);
      } catch (err) {
        if (!cancelled) console.error("Failed to load deliveries:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [apiFilters]);

  const openTrackingModal = useCallback(async (pkg: PackageListItem) => {
    setTrackingPkg(pkg);
    setTrackingInfo(null);
    if (pkg.tracking_number) {
      setTrackingLoading(true);
      try {
        const info = await trackingService.getTracking(
          pkg.tracking_number,
          pkg.carrier_name?.toLowerCase(),
        );
        setTrackingInfo(info);
      } catch {
        setTrackingInfo(null);
      } finally {
        setTrackingLoading(false);
      }
    }
  }, []);

  const refreshTracking = async () => {
    if (!trackingPkg?.tracking_number) return;
    trackingService.clearCache(trackingPkg.tracking_number);
    setTrackingLoading(true);
    try {
      const info = await trackingService.getTracking(
        trackingPkg.tracking_number,
        trackingPkg.carrier_name?.toLowerCase(),
      );
      setTrackingInfo(info);
    } finally {
      setTrackingLoading(false);
    }
  };

  const formatDate = (d?: string | null) => {
    if (!d) return "-";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
  };

  if (loading && packages.length === 0) {
    return (
      <div className="space-y-4 p-6">
        <PageHeader title="Deliveries" subtitle="Track shipped packages and delivery status" />
        <DataTableSkeleton columnCount={8} rowCount={10} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Deliveries"
        subtitle="Track shipped packages and delivery status"
        count={totalCount}
        actions={
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-purple-400" />
              <span className="text-muted-foreground">Booked {stats.booked}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-blue-400" />
              <span className="text-muted-foreground">Shipped {stats.shipped}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-emerald-400" />
              <span className="text-muted-foreground">Delivered {stats.delivered}</span>
            </div>
          </div>
        }
      />

      <DataTable table={table} onRowClick={(pkg) => openTrackingModal(pkg)}>
        <DataTableToolbar table={table} />
      </DataTable>

      {/* Tracking Details Modal */}
      {trackingPkg && (
        <ModalOverlay
          isDismissable
          isOpen={!!trackingPkg}
          onOpenChange={(isOpen) => { if (!isOpen) setTrackingPkg(null); }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <Modal className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl outline-none">
            <Dialog className="p-6 outline-none">
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Package size={18} />
                  {trackingPkg.packing_number}
                </h2>
                <button
                  onClick={() => setTrackingPkg(null)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Customer</span>
                    <p className="font-medium">{trackingPkg.customer_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Order</span>
                    <p className="font-medium">{trackingPkg.salesorder_number}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Courier</span>
                    <p className="font-medium">{trackingPkg.carrier_name || "Not assigned"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Destination</span>
                    <p className="font-medium">
                      {[trackingPkg.shipping_city, trackingPkg.shipping_code].filter(Boolean).join(", ") || "-"}
                    </p>
                  </div>
                </div>

                {trackingPkg.tracking_number ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Tracking</span>
                        <a
                          href={trackingService.getTrackingUrl(trackingPkg.tracking_number, trackingPkg.carrier_name?.toLowerCase())}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                        >
                          {trackingPkg.tracking_number}
                          <ExternalLink size={10} />
                        </a>
                      </div>
                      <button
                        onClick={refreshTracking}
                        disabled={trackingLoading}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={trackingLoading ? "animate-spin" : ""} />
                        Refresh
                      </button>
                    </div>

                    {trackingLoading && !trackingInfo && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <RefreshCw size={14} className="animate-spin" />
                        Loading tracking info...
                      </div>
                    )}

                    {trackingInfo && (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-border bg-muted/50 p-3">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {trackingInfo.status === "delivered" ? (
                              <CheckCircle size={14} className="text-emerald-400" />
                            ) : (
                              <Truck size={14} className="text-blue-400" />
                            )}
                            <span className="capitalize">{trackingInfo.status.replace(/_/g, " ")}</span>
                          </div>
                          {trackingInfo.latest_event && (
                            <p className="mt-1 text-xs text-muted-foreground">{trackingInfo.latest_event}</p>
                          )}
                        </div>

                        {trackingInfo.tracking_events && trackingInfo.tracking_events.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                              Tracking History
                            </p>
                            <div className="border-l-2 border-border pl-4">
                              {trackingInfo.tracking_events.slice(0, 8).map((ev, i) => (
                                <div key={i} className="relative pb-3 last:pb-0">
                                  <div
                                    className={`absolute -left-[21px] top-1 size-2.5 rounded-full border-2 ${
                                      i === 0 ? "border-primary bg-primary" : "border-muted-foreground/40 bg-background"
                                    }`}
                                  />
                                  <p className={`text-xs ${i === 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                                    {ev.description || ev.status}
                                  </p>
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                    {ev.location && (
                                      <span className="flex items-center gap-0.5"><MapPin size={9} />{ev.location}</span>
                                    )}
                                    <span className="flex items-center gap-0.5"><Clock size={9} />{formatDate(ev.date_time)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!trackingLoading && !trackingInfo && (
                      <p className="text-sm text-muted-foreground py-2">No tracking information available yet.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No tracking number assigned.</p>
                )}

                <div className="flex gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => navigate(`/view-order/${trackingPkg.order_id}`)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    View Order
                  </button>
                </div>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </div>
  );
}
