// src/components/warehouse/PackingListsPage.tsx
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  warehouseService,
  type Package,
  type KanbanPackage,
  type KanbanData,
} from '@/services/warehouseService';
import { PackingScanModal } from '@/components/warehouse/PackingScanModal';
import { ShippingBookingModal } from '@/components/warehouse/ShippingBookingModal';
import { PackingListEditModal } from '@/components/warehouse/PackingListEditModal';
import { triggerPackingListPrint } from '@/components/warehouse/PackingListPrint';
import PageHeader from '@/components/shared/PageHeader';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  RefreshCw,
  ScanLine,
  Truck,
  Printer,
  Edit,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Package as PackageIcon,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'sent_to_packing', label: 'Sent to Packing' },
  { key: 'packed', label: 'Packed' },
  { key: 'delivery_booked', label: 'Delivery Booked' },
  { key: 'shipped', label: 'Shipped' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  sent_to_packing: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  packed: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  delivery_booked: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  shipped: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
};

const STATUS_LABELS: Record<string, string> = {
  sent_to_packing: 'Sent to Packing',
  packed: 'Packed',
  delivery_booked: 'Delivery Booked',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

function kanbanToPackage(kp: KanbanPackage): Package {
  return {
    id: kp.id,
    packing_number: kp.packing_number,
    warehouse_status: kp.warehouse_status,
    status: kp.warehouse_status,
    salesorder_number: kp.salesorder_number,
    customer_name: kp.customer_name,
    order_total: kp.order_total,
    order_id: kp.order_id,
    carrier_name: null,
    tracking_number: null,
    expected_delivery_date: null,
    sent_to_packing_at: null,
    packed_at: null,
    delivery_booked_at: null,
    created_at: kp.created_at,
    updated_at: kp.created_at,
    items: [],
  };
}

export default function PackingListsPage() {
  usePageTitle('Packing Lists');
  const navigate = useNavigate();

  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedPkg, setExpandedPkg] = useState<Package | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [scanPkg, setScanPkg] = useState<Package | null>(null);
  const [bookingPkg, setBookingPkg] = useState<Package | null>(null);
  const [editPkg, setEditPkg] = useState<Package | null>(null);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kanban: KanbanData = await warehouseService.getKanbanData();
      const all: Package[] = [
        ...kanban.sent_to_packing.map(kanbanToPackage),
        ...kanban.packed.map(kanbanToPackage),
        ...kanban.delivery_booked.map(kanbanToPackage),
        ...kanban.shipped.map(kanbanToPackage),
        ...(kanban.delivered || []).map(kanbanToPackage),
      ];
      setPackages(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load packing lists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: packages.length };
    for (const p of packages) {
      counts[p.warehouse_status] = (counts[p.warehouse_status] || 0) + 1;
    }
    return counts;
  }, [packages]);

  const filteredPackages = useMemo(() => {
    let filtered = packages;
    if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.warehouse_status === statusFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.customer_name?.toLowerCase().includes(term) ||
          p.packing_number?.toLowerCase().includes(term) ||
          p.salesorder_number?.toLowerCase().includes(term),
      );
    }
    return filtered;
  }, [packages, statusFilter, searchTerm]);

  const handleExpand = async (pkg: Package) => {
    if (expandedId === pkg.id) {
      setExpandedId(null);
      setExpandedPkg(null);
      return;
    }
    setExpandedId(pkg.id);
    setExpandedPkg(null);
    setExpandedLoading(true);
    try {
      const full = await warehouseService.getPackage(pkg.id);
      setExpandedPkg(full);
    } catch {
      // Silently fail — row stays expanded but without detail
    } finally {
      setExpandedLoading(false);
    }
  };

  const handleModalSuccess = () => {
    setScanPkg(null);
    setBookingPkg(null);
    setEditPkg(null);
    setExpandedId(null);
    setExpandedPkg(null);
    fetchPackages();
  };

  const handlePrint = async (pkg: Package) => {
    try {
      const full = await warehouseService.getPackage(pkg.id);
      triggerPackingListPrint(full);
    } catch {
      // If we can't fetch full details, print with what we have
      triggerPackingListPrint(pkg);
    }
  };

  const handleScan = async (pkg: Package) => {
    try {
      const full = await warehouseService.getPackage(pkg.id);
      setScanPkg(full);
    } catch {
      setScanPkg(pkg);
    }
  };

  const handleEdit = async (pkg: Package) => {
    try {
      const full = await warehouseService.getPackage(pkg.id);
      setEditPkg(full);
    } catch {
      setEditPkg(pkg);
    }
  };

  const handleBookDelivery = async (pkg: Package) => {
    try {
      const full = await warehouseService.getPackage(pkg.id);
      setBookingPkg(full);
    } catch {
      setBookingPkg(pkg);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <PageHeader
        title="Packing Lists"
        count={filteredPackages.length}
        subtitle="packages"
        breadcrumbs={[
          { label: 'Shipping', href: '/shipping' },
          { label: 'Warehouse', href: '/warehouse' },
          { label: 'Packing Lists' },
        ]}
        actions={
          <Button
            intent="outline"
            size="sm"
            onPress={fetchPackages}
            isDisabled={loading}
          >
            <RefreshCw
              data-slot="icon"
              className={cn(loading && 'animate-spin')}
            />
            Refresh
          </Button>
        }
      />

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.key] || 0;
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full px-1.5 text-xs min-w-[1.25rem]',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by customer, packing number, or order number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={cn(
            'w-full rounded-lg border border-border bg-card px-10 py-2.5 text-sm text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50',
          )}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="sr-only">Clear search</span>
            &times;
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <p>{error}</p>
          <Button
            intent="outline"
            size="xs"
            onPress={fetchPackages}
            className="ml-auto"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading packing lists...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredPackages.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <PackageIcon className="size-10 opacity-40" />
          <p className="text-sm">
            {packages.length === 0
              ? 'No packing lists found'
              : 'No packing lists match your filters'}
          </p>
        </div>
      )}

      {/* Package list */}
      {!loading && filteredPackages.length > 0 && (
        <div className="flex flex-col gap-1">
          {filteredPackages.map((pkg) => {
            const isExpanded = expandedId === pkg.id;
            return (
              <div key={pkg.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Row */}
                <div
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/50',
                    isExpanded && 'bg-secondary/30',
                  )}
                  onClick={() => handleExpand(pkg)}
                >
                  {/* Expand indicator */}
                  <div className="shrink-0 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </div>

                  {/* Left: packing number, customer, order */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-foreground">
                        {pkg.packing_number}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-foreground truncate">
                        {pkg.customer_name}
                      </span>
                      <span className="text-muted-foreground">&middot;</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/order/${pkg.order_id}`);
                        }}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        {pkg.salesorder_number}
                      </button>
                    </div>
                  </div>

                  {/* Middle: status badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        STATUS_COLORS[pkg.warehouse_status] || 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {STATUS_LABELS[pkg.warehouse_status] || pkg.warehouse_status}
                    </Badge>
                  </div>

                  {/* Right: action buttons */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pkg.warehouse_status === 'sent_to_packing' && (
                      <>
                        <Button
                          intent="primary"
                          size="xs"
                          onPress={() => handleScan(pkg)}
                        >
                          <ScanLine data-slot="icon" />
                          Scan
                        </Button>
                        <Button
                          intent="outline"
                          size="xs"
                          onPress={() => handleEdit(pkg)}
                        >
                          <Edit data-slot="icon" />
                          Edit
                        </Button>
                      </>
                    )}
                    {pkg.warehouse_status === 'packed' && (
                      <>
                        <Button
                          intent="primary"
                          size="xs"
                          onPress={() => handleBookDelivery(pkg)}
                        >
                          <Truck data-slot="icon" />
                          Book Delivery
                        </Button>
                        <Button
                          intent="outline"
                          size="xs"
                          onPress={() => handleEdit(pkg)}
                        >
                          <Edit data-slot="icon" />
                          Edit
                        </Button>
                      </>
                    )}
                    {(pkg.warehouse_status === 'delivery_booked' ||
                      pkg.warehouse_status === 'shipped') && (
                      <Button
                        intent="outline"
                        size="xs"
                        onPress={() => navigate(`/order/${pkg.order_id}`)}
                      >
                        <ExternalLink data-slot="icon" />
                        View Order
                      </Button>
                    )}
                    <Button
                      intent="outline"
                      size="xs"
                      onPress={() => handlePrint(pkg)}
                    >
                      <Printer data-slot="icon" />
                      Print
                    </Button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border bg-secondary/20 px-4 py-4">
                    {expandedLoading ? (
                      <div className="flex items-center gap-2 py-4 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="text-sm">Loading details...</span>
                      </div>
                    ) : expandedPkg ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Items table */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Items ({expandedPkg.items?.length || 0})
                          </h4>
                          {expandedPkg.items && expandedPkg.items.length > 0 ? (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground">
                                  <th className="text-left py-1.5 pr-3 font-medium text-xs">SKU</th>
                                  <th className="text-left py-1.5 pr-3 font-medium text-xs">Item Name</th>
                                  <th className="text-right py-1.5 font-medium text-xs">Qty Packed</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedPkg.items.map((item) => (
                                  <tr
                                    key={item.id}
                                    className="border-b border-border/50 last:border-0"
                                  >
                                    <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">
                                      {item.sku}
                                    </td>
                                    <td className="py-1.5 pr-3 text-foreground">
                                      {item.item_name}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-foreground">
                                      {item.quantity_packed}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-sm text-muted-foreground">No items found</p>
                          )}
                        </div>

                        {/* Shipping address and metadata */}
                        <div className="flex flex-col gap-3">
                          {expandedPkg.shipping_address_json && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                Shipping Address
                              </h4>
                              <div className="text-sm text-foreground leading-relaxed">
                                {Object.entries(expandedPkg.shipping_address_json)
                                  .filter(([, v]) => v)
                                  .map(([key, value]) => (
                                    <div key={key}>{value}</div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {expandedPkg.carrier_name && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                Shipping Details
                              </h4>
                              <div className="text-sm text-foreground space-y-0.5">
                                <div>Carrier: {expandedPkg.carrier_name}</div>
                                {expandedPkg.tracking_number && (
                                  <div>Tracking: {expandedPkg.tracking_number}</div>
                                )}
                                {expandedPkg.expected_delivery_date && (
                                  <div>
                                    Expected:{' '}
                                    {new Date(expandedPkg.expected_delivery_date).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                              Created
                            </h4>
                            <p className="text-sm text-foreground">
                              {new Date(expandedPkg.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        Unable to load package details
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
