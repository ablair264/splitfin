import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UniqueIdentifier } from '@dnd-kit/core';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem as KanbanItemPrimitive,
  KanbanItemHandle,
  KanbanOverlay,
} from '@/components/ui/kanban';
import PageHeader from '@/components/shared/PageHeader';
import { usePageTitle } from '@/hooks/usePageTitle';
import { authService } from '@/services/authService';
import { warehouseService, type KanbanPackage } from '@/services/warehouseService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Package,
  CheckCircle,
  Truck,
  MapPin,
  User,
  DollarSign,
  Clock,
  AlertTriangle,
  RefreshCw,
  Eye,
  GripVertical,
  BoxIcon,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────

type WarehouseStatus = 'sent_to_packing' | 'packed' | 'delivery_booked' | 'shipped' | 'delivered';

interface KanbanItem extends KanbanPackage {
  _kanbanId: string;
}

const COLUMNS: { id: WarehouseStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'sent_to_packing', label: 'Sent to Packing', icon: <Send size={16} />, color: 'text-amber-500' },
  { id: 'packed', label: 'Packed', icon: <Package size={16} />, color: 'text-blue-500' },
  { id: 'delivery_booked', label: 'Delivery Booked', icon: <Truck size={16} />, color: 'text-purple-500' },
  { id: 'shipped', label: 'Shipped', icon: <BoxIcon size={16} />, color: 'text-cyan-500' },
  { id: 'delivered', label: 'Delivered', icon: <MapPin size={16} />, color: 'text-emerald-500' },
];

const STATUS_ORDER: WarehouseStatus[] = ['sent_to_packing', 'packed', 'delivery_booked', 'shipped', 'delivered'];

function getNextStatus(current: WarehouseStatus): WarehouseStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
}

function getActionText(status: WarehouseStatus): string | null {
  switch (status) {
    case 'sent_to_packing': return 'Mark Packed';
    case 'packed': return 'Book Delivery';
    case 'delivery_booked': return 'Mark Shipped';
    case 'shipped': return 'Mark Delivered';
    default: return null;
  }
}

function getStatusBadgeClass(status: WarehouseStatus): string {
  switch (status) {
    case 'sent_to_packing': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'packed': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'delivery_booked': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'shipped': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
    case 'delivered': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Package Card ────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  onStatusUpdate,
  isUpdating,
  isDragOverlay = false,
}: {
  pkg: KanbanItem;
  onStatusUpdate: (packageId: number, newStatus: WarehouseStatus) => void;
  isUpdating: boolean;
  isDragOverlay?: boolean;
}) {
  const navigate = useNavigate();
  const status = pkg.warehouse_status as WarehouseStatus;
  const nextStatus = getNextStatus(status);
  const actionText = getActionText(status);

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm space-y-2',
        isDragOverlay && 'shadow-lg ring-2 ring-primary/20 rotate-[2deg]',
      )}
    >
      {/* Header: packing number + view */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">
          {pkg.packing_number}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/orders/${pkg.order_id}`);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            title="View order"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>

      {/* Sales order number (clickable subtitle) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/orders/${pkg.order_id}`);
        }}
        className="text-xs text-primary hover:text-primary/80 transition-colors truncate block"
      >
        {pkg.salesorder_number}
      </button>

      {/* Customer */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User size={12} />
        <span className="truncate">{pkg.customer_name || 'Unknown'}</span>
      </div>

      {/* Meta row: item count + amount */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-xs h-5 gap-1">
          <Package size={10} />
          {pkg.item_count} {pkg.item_count === 1 ? 'item' : 'items'}
        </Badge>
        <span className="flex items-center gap-1 font-medium text-foreground">
          <DollarSign size={12} />
          {formatCurrency(pkg.order_total || 0)}
        </span>
      </div>

      {/* Action button */}
      {nextStatus && actionText && !isDragOverlay && (
        <Button
          size="sm"
          intent="outline"
          className="w-full h-7 text-xs"
          isDisabled={isUpdating}
          onPress={() => {
            onStatusUpdate(pkg.id, nextStatus);
          }}
        >
          {isUpdating ? (
            <RefreshCw size={12} className="animate-spin mr-1" />
          ) : (
            <CheckCircle size={12} className="mr-1" />
          )}
          {isUpdating ? 'Updating...' : actionText}
        </Button>
      )}

      {status === 'delivered' && !isDragOverlay && (
        <Badge className={cn('text-xs w-full justify-center', getStatusBadgeClass('delivered'))}>
          <CheckCircle size={12} />
          Delivered
        </Badge>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export default function Warehouse() {
  usePageTitle('Warehouse');

  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingPackages, setUpdatingPackages] = useState<Set<number>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Kanban state: Record<ColumnId, KanbanItem[]>
  const [columns, setColumns] = useState<Record<UniqueIdentifier, KanbanItem[]>>({
    sent_to_packing: [],
    packed: [],
    delivery_booked: [],
    shipped: [],
    delivered: [],
  });

  // Auth check
  useEffect(() => {
    const agent = authService.getCachedAgent();
    if (!agent) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    setAuthenticated(true);
  }, []);

  // Fetch packages
  const fetchPackages = useCallback(async () => {
    if (!authenticated) return;
    try {
      setError(null);
      const data = await warehouseService.getKanbanData();

      const enrich = (packages: KanbanPackage[], status: WarehouseStatus): KanbanItem[] =>
        packages.map((p) => ({
          ...p,
          warehouse_status: status,
          _kanbanId: `${status}-${p.id}`,
        }));

      setColumns({
        sent_to_packing: enrich(data.sent_to_packing, 'sent_to_packing'),
        packed: enrich(data.packed, 'packed'),
        delivery_booked: enrich(data.delivery_booked, 'delivery_booked'),
        shipped: enrich(data.shipped, 'shipped'),
        delivered: enrich(data.delivered, 'delivered'),
      });
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching warehouse packages:', err);
      setError('Failed to fetch warehouse packages');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) fetchPackages();
  }, [fetchPackages, authenticated]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(fetchPackages, 30000);
    return () => clearInterval(interval);
  }, [fetchPackages, authenticated]);

  // Handle status update (button click)
  const handleStatusUpdate = useCallback(
    async (packageId: number, newStatus: WarehouseStatus) => {
      setUpdatingPackages((prev) => new Set([...prev, packageId]));
      try {
        await warehouseService.updatePackageStatus(packageId, newStatus);
        await fetchPackages();
      } catch (err) {
        console.error('Error updating package status:', err);
        setError(err instanceof Error ? err.message : 'Failed to update package status');
        setTimeout(() => setError(null), 5000);
      } finally {
        setUpdatingPackages((prev) => {
          const next = new Set(prev);
          next.delete(packageId);
          return next;
        });
      }
    },
    [fetchPackages],
  );

  // Handle kanban drag-and-drop column changes
  const handleValueChange = useCallback(
    async (newColumns: Record<UniqueIdentifier, KanbanItem[]>) => {
      // Find which package moved to a different column
      const prevColumns = columns;
      let movedPackage: KanbanItem | null = null;
      let targetColumn: WarehouseStatus | null = null;

      for (const colId of STATUS_ORDER) {
        const newItems = newColumns[colId] ?? [];
        const prevItems = prevColumns[colId] ?? [];

        // Find items in new that weren't in prev
        const prevIds = new Set(prevItems.map((p) => p._kanbanId));
        for (const item of newItems) {
          if (!prevIds.has(item._kanbanId)) {
            movedPackage = item;
            targetColumn = colId;
            break;
          }
        }
        if (movedPackage) break;
      }

      // Optimistically update UI
      setColumns(newColumns);

      // If a package moved to a different column, update its status
      if (movedPackage && targetColumn) {
        try {
          await warehouseService.updatePackageStatus(movedPackage.id, targetColumn);
          // Refresh to get accurate data from server
          await fetchPackages();
        } catch (err) {
          console.error('Drag-drop update failed:', err);
          setError('Failed to update package via drag-and-drop');
          setTimeout(() => setError(null), 4000);
          // Revert optimistic update
          setColumns(prevColumns);
        }
      }
    },
    [columns, fetchPackages],
  );

  // Stats
  const stats = useMemo(() => {
    const allPackages = Object.values(columns).flat();
    return {
      total: allPackages.length,
      value: allPackages.reduce((sum, p) => sum + (p.order_total || 0), 0),
    };
  }, [columns]);

  // Find a package by kanban ID for the overlay
  const findPackage = useCallback(
    (id: UniqueIdentifier): KanbanItem | undefined => {
      for (const items of Object.values(columns)) {
        const found = items.find((p) => p._kanbanId === id);
        if (found) return found;
      }
      return undefined;
    },
    [columns],
  );

  // Column count map
  const columnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const col of COLUMNS) {
      counts[col.id] = (columns[col.id] ?? []).length;
    }
    return counts;
  }, [columns]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Warehouse"
          subtitle="Loading..."
          breadcrumbs={[
            { label: 'Shipping', href: '/shipping/warehouse' },
            { label: 'Warehouse' },
          ]}
        />
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Warehouse"
        subtitle={`${stats.total} active packages`}
        count={stats.total}
        breadcrumbs={[
          { label: 'Shipping', href: '/shipping/warehouse' },
          { label: 'Warehouse' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            {/* Stats pills */}
            <div className="hidden md:flex items-center gap-2">
              <Badge variant="outline" className="text-xs gap-1 py-1">
                <Package size={12} />
                {stats.total} packages
              </Badge>
              <Badge variant="outline" className="text-xs gap-1 py-1">
                <DollarSign size={12} />
                {formatCurrency(stats.value)}
              </Badge>
            </div>

            {/* Last refresh */}
            <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground">
              <Clock size={12} />
              {lastRefresh.toLocaleTimeString()}
            </span>

            {/* Refresh button */}
            <Button
              intent="outline"
              size="sm"
              onPress={fetchPackages}
              isDisabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Kanban Board */}
      <Kanban<KanbanItem>
        value={columns}
        onValueChange={handleValueChange}
        getItemValue={(item) => item._kanbanId}
        flatCursor
      >
        <KanbanBoard className="gap-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              value={col.id}
              className="min-w-[280px] max-w-[340px] flex-1 rounded-xl border border-border/50 bg-muted/30 p-0 gap-0"
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <span className={col.color}>{col.icon}</span>
                  <span className="text-sm font-medium text-foreground">{col.label}</span>
                </div>
                <Badge
                  variant="secondary"
                  className="text-xs tabular-nums h-5 min-w-[20px] justify-center"
                >
                  {columnCounts[col.id] ?? 0}
                </Badge>
              </div>

              {/* Column body */}
              <div className="flex flex-col gap-2 p-2 min-h-[120px] overflow-y-auto max-h-[calc(100vh-280px)]">
                {(columns[col.id] ?? []).map((pkg) => (
                  <KanbanItemPrimitive
                    key={pkg._kanbanId}
                    value={pkg._kanbanId}
                    className="rounded-lg"
                  >
                    <div className="flex gap-1">
                      <KanbanItemHandle className="flex items-start pt-3 px-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                        <GripVertical size={14} />
                      </KanbanItemHandle>
                      <div className="flex-1 min-w-0">
                        <PackageCard
                          pkg={pkg}
                          onStatusUpdate={handleStatusUpdate}
                          isUpdating={updatingPackages.has(pkg.id)}
                        />
                      </div>
                    </div>
                  </KanbanItemPrimitive>
                ))}

                {/* Empty state */}
                {(columns[col.id] ?? []).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
                    <span className={cn('mb-2', col.color)}>{col.icon}</span>
                    <span className="text-xs">No packages</span>
                  </div>
                )}
              </div>
            </KanbanColumn>
          ))}
        </KanbanBoard>

        {/* Drag overlay */}
        <KanbanOverlay>
          {({ value, variant }) => {
            if (variant === 'column') return null;
            const pkg = findPackage(value);
            if (!pkg) return null;
            return (
              <div className="w-[280px]">
                <PackageCard
                  pkg={pkg}
                  onStatusUpdate={handleStatusUpdate}
                  isUpdating={false}
                  isDragOverlay
                />
              </div>
            );
          }}
        </KanbanOverlay>
      </Kanban>
    </div>
  );
}
