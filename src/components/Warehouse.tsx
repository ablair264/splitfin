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
  User,
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

const COLUMNS: { id: WarehouseStatus; label: string; shortLabel: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { id: 'sent_to_packing', label: 'Sent to Packing', shortLabel: 'Packing', icon: <Send size={14} />, color: 'text-amber-500', bg: 'bg-amber-500/5' },
  { id: 'packed', label: 'Packed', shortLabel: 'Packed', icon: <Package size={14} />, color: 'text-blue-500', bg: 'bg-blue-500/5' },
  { id: 'delivery_booked', label: 'Delivery Booked', shortLabel: 'Booked', icon: <Truck size={14} />, color: 'text-purple-500', bg: 'bg-purple-500/5' },
  { id: 'shipped', label: 'Shipped', shortLabel: 'Shipped', icon: <BoxIcon size={14} />, color: 'text-cyan-500', bg: 'bg-cyan-500/5' },
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

// ── Helpers ──────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Compact Package Card ─────────────────────────────────────────────────

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
        'rounded-md border bg-card px-2.5 py-2 shadow-sm',
        isDragOverlay && 'shadow-lg ring-2 ring-primary/20 rotate-[1deg]',
      )}
    >
      {/* Row 1: customer name (headline) */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <User size={11} className="shrink-0 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground truncate">
          {pkg.customer_name || 'Unknown'}
        </span>
      </div>

      {/* Row 2: packing number + order number + items */}
      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
        <span className="truncate">{pkg.packing_number}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/order/${pkg.order_id}`);
          }}
          className="text-[10px] text-primary hover:text-primary/80 transition-colors shrink-0"
          title={`View ${pkg.salesorder_number}`}
        >
          {pkg.salesorder_number}
        </button>
        <span className="shrink-0 tabular-nums">{pkg.item_count} item{pkg.item_count !== 1 ? 's' : ''}</span>
      </div>

      {/* Row 3: action button (compact) */}
      {nextStatus && actionText && !isDragOverlay && (
        <Button
          size="xs"
          intent="outline"
          className="w-full mt-1.5 h-6 text-[11px]"
          isDisabled={isUpdating}
          onPress={() => onStatusUpdate(pkg.id, nextStatus)}
        >
          {isUpdating ? (
            <RefreshCw size={10} className="animate-spin" />
          ) : (
            <CheckCircle size={10} />
          )}
          {isUpdating ? 'Updating...' : actionText}
        </Button>
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

  const [columns, setColumns] = useState<Record<UniqueIdentifier, KanbanItem[]>>({
    sent_to_packing: [],
    packed: [],
    delivery_booked: [],
    shipped: [],
  });

  useEffect(() => {
    const agent = authService.getCachedAgent();
    if (!agent) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    setAuthenticated(true);
  }, []);

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

  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(fetchPackages, 30000);
    return () => clearInterval(interval);
  }, [fetchPackages, authenticated]);

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

  const handleValueChange = useCallback(
    async (newColumns: Record<UniqueIdentifier, KanbanItem[]>) => {
      const prevColumns = columns;
      let movedPackage: KanbanItem | null = null;
      let targetColumn: WarehouseStatus | null = null;

      for (const colId of STATUS_ORDER) {
        const newItems = newColumns[colId] ?? [];
        const prevItems = prevColumns[colId] ?? [];
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

      setColumns(newColumns);

      if (movedPackage && targetColumn) {
        try {
          await warehouseService.updatePackageStatus(movedPackage.id, targetColumn);
          await fetchPackages();
        } catch (err) {
          console.error('Drag-drop update failed:', err);
          setError('Failed to update package via drag-and-drop');
          setTimeout(() => setError(null), 4000);
          setColumns(prevColumns);
        }
      }
    },
    [columns, fetchPackages],
  );

  const stats = useMemo(() => {
    const allPackages = Object.values(columns).flat();
    return {
      total: allPackages.length,
      value: allPackages.reduce((sum, p) => sum + (p.order_total || 0), 0),
    };
  }, [columns]);

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

  const columnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const col of COLUMNS) {
      counts[col.id] = (columns[col.id] ?? []).length;
    }
    return counts;
  }, [columns]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
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
    <div className="p-4 space-y-4 h-[calc(100vh-64px)] flex flex-col">
      {/* Page Header — compact */}
      <PageHeader
        title="Warehouse"
        count={stats.total}
        subtitle="active packages"
        breadcrumbs={[
          { label: 'Shipping', href: '/shipping/warehouse' },
          { label: 'Warehouse' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground">
              <Clock size={11} />
              {lastRefresh.toLocaleTimeString()}
            </span>
            <Button
              intent="outline"
              size="xs"
              onPress={fetchPackages}
              isDisabled={loading}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive shrink-0">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Kanban Board — fills remaining height */}
      <div className="flex-1 min-h-0 overflow-x-auto">
        <Kanban<KanbanItem>
          value={columns}
          onValueChange={handleValueChange}
          getItemValue={(item) => item._kanbanId}
          flatCursor
        >
          <KanbanBoard className="gap-3 h-full min-w-max">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                value={col.id}
                className={cn(
                  'w-[280px] flex-1 rounded-lg border border-border/40 p-0 gap-0 flex flex-col h-full',
                  col.bg,
                )}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-2.5 py-2 border-b border-border/40 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className={col.color}>{col.icon}</span>
                    <span className="text-xs font-medium text-foreground">{col.shortLabel}</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px] tabular-nums h-4 min-w-[18px] justify-center px-1"
                  >
                    {columnCounts[col.id] ?? 0}
                  </Badge>
                </div>

                {/* Column body — scrollable */}
                <div className="flex flex-col gap-1.5 p-1.5 flex-1 min-h-0 overflow-y-auto">
                  {(columns[col.id] ?? []).map((pkg) => (
                    <KanbanItemPrimitive
                      key={pkg._kanbanId}
                      value={pkg._kanbanId}
                      className="rounded-md"
                    >
                      <div className="flex gap-0.5">
                        <KanbanItemHandle className="flex items-center px-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors">
                          <GripVertical size={12} />
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
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/40">
                      <span className={cn('mb-1', col.color)}>{col.icon}</span>
                      <span className="text-[10px]">No packages</span>
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
                <div className="w-[270px]">
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
    </div>
  );
}
