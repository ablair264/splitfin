import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UniqueIdentifier } from '@dnd-kit/core';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from '@/components/ui/kanban';
import PageHeader from '@/components/shared/PageHeader';
import { usePageTitle } from '@/hooks/usePageTitle';
import { authService } from '@/services/authService';
import { shippingService, type OrderWithShipping } from '@/services/shippingService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Package,
  CheckCircle,
  Truck,
  MapPin,
  User,
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  RefreshCw,
  Eye,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────

type WarehouseStatus = 'sent_to_packing' | 'packed' | 'delivery_booked' | 'delivered';

interface KanbanOrder extends OrderWithShipping {
  _kanbanId: string; // unique ID for kanban item
}

const COLUMNS: { id: WarehouseStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'sent_to_packing', label: 'Sent to Packing', icon: <Package size={16} />, color: 'text-amber-500' },
  { id: 'packed', label: 'Packed', icon: <CheckCircle size={16} />, color: 'text-blue-500' },
  { id: 'delivery_booked', label: 'Delivery Booked', icon: <Truck size={16} />, color: 'text-purple-500' },
  { id: 'delivered', label: 'Delivered', icon: <MapPin size={16} />, color: 'text-emerald-500' },
];

const STATUS_ORDER: WarehouseStatus[] = ['sent_to_packing', 'packed', 'delivery_booked', 'delivered'];

function getNextStatus(current: WarehouseStatus): WarehouseStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
}

function getActionText(status: WarehouseStatus): string | null {
  switch (status) {
    case 'sent_to_packing': return 'Mark Packed';
    case 'packed': return 'Book Delivery';
    case 'delivery_booked': return 'Mark Delivered';
    default: return null;
  }
}

function getStatusBadgeClass(status: WarehouseStatus): string {
  switch (status) {
    case 'sent_to_packing': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'packed': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'delivery_booked': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'delivered': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Order Card ──────────────────────────────────────────────────────────

function OrderCard({
  order,
  onStatusUpdate,
  isUpdating,
  isDragOverlay = false,
}: {
  order: KanbanOrder;
  onStatusUpdate: (orderId: string, newStatus: WarehouseStatus) => void;
  isUpdating: boolean;
  isDragOverlay?: boolean;
}) {
  const navigate = useNavigate();
  const status = (order.warehouse_status ?? order.status) as WarehouseStatus;
  const nextStatus = getNextStatus(status);
  const actionText = getActionText(status);

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm space-y-2',
        isDragOverlay && 'shadow-lg ring-2 ring-primary/20 rotate-[2deg]',
      )}
    >
      {/* Header: order number + view */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">
          {order.salesorder_number || order.legacy_order_number || `#${String(order.id).slice(0, 8)}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/orders/${order.id}`);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            title="View order"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User size={12} />
        <span className="truncate">
          {order.customers?.display_name || order.customers?.trading_name || order.customer_name || 'Unknown'}
        </span>
      </div>

      {/* Meta row: date + amount */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {formatDate(order.date || order.order_date || order.created_at)}
        </span>
        <span className="flex items-center gap-1 font-medium text-foreground">
          <DollarSign size={12} />
          {formatCurrency(order.total || 0)}
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
            onStatusUpdate(order.id ?? String(order.id), nextStatus);
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

  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrders, setUpdatingOrders] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Kanban state: Record<ColumnId, KanbanOrder[]>
  const [columns, setColumns] = useState<Record<UniqueIdentifier, KanbanOrder[]>>({
    sent_to_packing: [],
    packed: [],
    delivery_booked: [],
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

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!authenticated) return;
    try {
      setError(null);
      const data = await shippingService.getOrdersByWarehouseStatus('jwt-managed');

      const enrich = (orders: OrderWithShipping[], status: WarehouseStatus): KanbanOrder[] =>
        orders.map((o) => ({
          ...o,
          warehouse_status: status,
          _kanbanId: `${status}-${o.id}`,
        }));

      setColumns({
        sent_to_packing: enrich(data.sentToPacking, 'sent_to_packing'),
        packed: enrich(data.packed, 'packed'),
        delivery_booked: enrich(data.deliveryBooked, 'delivery_booked'),
        delivered: enrich(data.delivered, 'delivered'),
      });
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching warehouse orders:', err);
      setError('Failed to fetch warehouse orders');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) fetchOrders();
  }, [fetchOrders, authenticated]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, authenticated]);

  // Handle status update (button click)
  const handleStatusUpdate = useCallback(
    async (orderId: string, newStatus: WarehouseStatus) => {
      setUpdatingOrders((prev) => new Set([...prev, orderId]));
      try {
        let result: { success: boolean; message: string };
        switch (newStatus) {
          case 'packed':
            result = await shippingService.markOrderAsPacked(orderId);
            break;
          case 'delivery_booked':
            result = await shippingService.bookDelivery(orderId);
            break;
          case 'delivered':
            result = await shippingService.markAsDelivered(orderId);
            break;
          default:
            throw new Error('Invalid status');
        }
        if (result.success) {
          await fetchOrders();
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        console.error('Error updating order status:', err);
        setError(err instanceof Error ? err.message : 'Failed to update order status');
        setTimeout(() => setError(null), 5000);
      } finally {
        setUpdatingOrders((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    },
    [fetchOrders],
  );

  // Handle kanban drag-and-drop column changes
  const handleValueChange = useCallback(
    async (newColumns: Record<UniqueIdentifier, KanbanOrder[]>) => {
      // Find which order moved to a different column
      const prevColumns = columns;
      let movedOrder: KanbanOrder | null = null;
      let targetColumn: WarehouseStatus | null = null;

      for (const colId of STATUS_ORDER) {
        const newItems = newColumns[colId] ?? [];
        const prevItems = prevColumns[colId] ?? [];

        // Find items in new that weren't in prev
        const prevIds = new Set(prevItems.map((o) => o._kanbanId));
        for (const item of newItems) {
          if (!prevIds.has(item._kanbanId)) {
            movedOrder = item;
            targetColumn = colId;
            break;
          }
        }
        if (movedOrder) break;
      }

      // Optimistically update UI
      setColumns(newColumns);

      // If an order moved to a different column, update its status
      if (movedOrder && targetColumn) {
        const orderId = movedOrder.id ?? String(movedOrder.id);
        try {
          let result: { success: boolean; message: string };
          switch (targetColumn) {
            case 'sent_to_packing':
              result = await shippingService.sendOrderToPacking(String(orderId));
              break;
            case 'packed':
              result = await shippingService.markOrderAsPacked(String(orderId));
              break;
            case 'delivery_booked':
              result = await shippingService.bookDelivery(String(orderId));
              break;
            case 'delivered':
              result = await shippingService.markAsDelivered(String(orderId));
              break;
            default:
              return;
          }
          if (!result.success) throw new Error(result.message);
          // Refresh to get accurate data from server
          await fetchOrders();
        } catch (err) {
          console.error('Drag-drop update failed:', err);
          setError('Failed to update order via drag-and-drop');
          setTimeout(() => setError(null), 4000);
          // Revert optimistic update
          setColumns(prevColumns);
        }
      }
    },
    [columns, fetchOrders],
  );

  // Stats
  const stats = useMemo(() => {
    const allOrders = Object.values(columns).flat();
    return {
      total: allOrders.length,
      value: allOrders.reduce((sum, o) => sum + (o.total || 0), 0),
    };
  }, [columns]);

  // Find an order by kanban ID for the overlay
  const findOrder = useCallback(
    (id: UniqueIdentifier): KanbanOrder | undefined => {
      for (const items of Object.values(columns)) {
        const found = items.find((o) => o._kanbanId === id);
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
        subtitle={`${stats.total} active orders`}
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
                {stats.total} orders
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
              onPress={fetchOrders}
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
      <Kanban<KanbanOrder>
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
                {(columns[col.id] ?? []).map((order) => (
                  <KanbanItem
                    key={order._kanbanId}
                    value={order._kanbanId}
                    className="rounded-lg"
                  >
                    <div className="flex gap-1">
                      <KanbanItemHandle className="flex items-start pt-3 px-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                        <GripVertical size={14} />
                      </KanbanItemHandle>
                      <div className="flex-1 min-w-0">
                        <OrderCard
                          order={order}
                          onStatusUpdate={handleStatusUpdate}
                          isUpdating={updatingOrders.has(String(order.id))}
                        />
                      </div>
                    </div>
                  </KanbanItem>
                ))}

                {/* Empty state */}
                {(columns[col.id] ?? []).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
                    <span className={cn('mb-2', col.color)}>{col.icon}</span>
                    <span className="text-xs">No orders</span>
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
            const order = findOrder(value);
            if (!order) return null;
            return (
              <div className="w-[280px]">
                <OrderCard
                  order={order}
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
