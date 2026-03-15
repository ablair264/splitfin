import { useState, useEffect, useCallback } from 'react';
import { warehouseService, type Package } from '@/services/warehouseService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Package as PackageIcon, ChevronDown, ChevronUp, Truck, CheckCircle,
  Printer, ScanLine, Edit, Trash2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  not_shipped: 'bg-zinc-500/10 text-zinc-500',
  sent_to_packing: 'bg-amber-500/10 text-amber-500',
  packed: 'bg-blue-500/10 text-blue-500',
  delivery_booked: 'bg-purple-500/10 text-purple-500',
  shipped: 'bg-emerald-500/10 text-emerald-500',
  delivered: 'bg-emerald-600/10 text-emerald-600',
};

const STATUS_LABELS: Record<string, string> = {
  not_shipped: 'Not Shipped',
  sent_to_packing: 'Sent to Packing',
  packed: 'Packed',
  delivery_booked: 'Delivery Booked',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

interface OrderPackagesSectionProps {
  orderId: number;
  onOpenScan?: (pkg: Package) => void;
  onOpenBooking?: (pkg: Package) => void;
  onOpenEdit?: (pkg: Package) => void;
  onOpenPrint?: (pkg: Package) => void;
}

export function OrderPackagesSection({
  orderId,
  onOpenScan,
  onOpenBooking,
  onOpenEdit,
  onOpenPrint,
}: OrderPackagesSectionProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      setError(null);
      const data = await warehouseService.getPackagesForOrder(orderId);
      setPackages(data);
    } catch (err) {
      console.error('Error fetching packages:', err);
      setError('Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const handleDelete = async (pkg: Package) => {
    if (!window.confirm(`Delete package ${pkg.packing_number}? This will rollback shipped quantities.`)) return;
    setDeletingId(pkg.id);
    try {
      await warehouseService.deletePackage(pkg.id);
      await fetchPackages();
    } catch (err) {
      console.error('Error deleting package:', err);
      setError('Failed to delete package');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdvanceStatus = async (pkg: Package) => {
    const nextMap: Record<string, string> = {
      sent_to_packing: 'packed',
      packed: 'delivery_booked',
      delivery_booked: 'shipped',
      shipped: 'delivered',
    };
    const next = nextMap[pkg.warehouse_status];
    if (!next) return;

    try {
      await warehouseService.updatePackageStatus(pkg.id, next);
      await fetchPackages();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <RefreshCw size={14} className="animate-spin" /> Loading packages...
      </div>
    );
  }

  if (packages.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <PackageIcon size={16} />
        Packages ({packages.length})
      </h3>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="space-y-2">
        {packages.map((pkg) => {
          const expanded = expandedId === pkg.id;
          return (
            <div key={pkg.id} className="border rounded-lg overflow-hidden">
              {/* Package header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expanded ? null : pkg.id)}
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span className="font-mono text-sm font-medium">{pkg.packing_number}</span>
                <Badge className={cn('text-xs', STATUS_COLORS[pkg.warehouse_status] || '')}>
                  {STATUS_LABELS[pkg.warehouse_status] || pkg.warehouse_status}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {pkg.items?.length || 0} items
                </span>
                {pkg.tracking_number && (
                  <span className="text-xs text-muted-foreground">
                    {pkg.carrier_name}: {pkg.tracking_number}
                  </span>
                )}
              </div>

              {/* Expanded content */}
              {expanded && (
                <div className="border-t px-4 py-3 space-y-3">
                  {/* Items table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1">SKU</th>
                        <th className="text-left pb-1">Item</th>
                        <th className="text-right pb-1">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(pkg.items || []).map((item) => (
                        <tr key={item.id}>
                          <td className="py-1 font-mono">{item.sku}</td>
                          <td className="py-1 truncate max-w-[200px]">{item.item_name}</td>
                          <td className="py-1 text-right tabular-nums">{item.quantity_packed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                    {pkg.warehouse_status === 'sent_to_packing' && onOpenScan && (
                      <Button intent="outline" size="xs" onPress={() => onOpenScan(pkg)}>
                        <ScanLine size={12} /> Scan
                      </Button>
                    )}
                    {pkg.warehouse_status === 'packed' && onOpenBooking && (
                      <Button intent="outline" size="xs" onPress={() => onOpenBooking(pkg)}>
                        <Truck size={12} /> Book Delivery
                      </Button>
                    )}
                    {onOpenEdit && (
                      <Button intent="outline" size="xs" onPress={() => onOpenEdit(pkg)}>
                        <Edit size={12} /> Edit
                      </Button>
                    )}
                    {onOpenPrint && (
                      <Button intent="outline" size="xs" onPress={() => onOpenPrint(pkg)}>
                        <Printer size={12} /> Print
                      </Button>
                    )}
                    {!['delivered', 'shipped'].includes(pkg.warehouse_status) && (
                      <Button
                        intent="outline"
                        size="xs"
                        onPress={() => handleAdvanceStatus(pkg)}
                        className="ml-auto"
                      >
                        <CheckCircle size={12} /> Advance Status
                      </Button>
                    )}
                    {['not_shipped', 'sent_to_packing'].includes(pkg.warehouse_status) && (
                      <Button
                        intent="danger"
                        size="xs"
                        onPress={() => handleDelete(pkg)}
                        isDisabled={deletingId === pkg.id}
                      >
                        <Trash2 size={12} /> {deletingId === pkg.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
