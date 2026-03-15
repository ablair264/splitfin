// src/components/warehouse/PackageAllocationModal.tsx
import { useState, useEffect } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService } from '@/services/warehouseService';
import type { Order } from '@/types/domain';
import {
  Package, X, AlertTriangle, CheckCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AllocationItem {
  order_line_item_id: number;
  sku: string;
  name: string;
  ordered: number;
  shipped: number;
  remaining: number;
  allocate: number;
}

interface PackageAllocationModalProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PackageAllocationModal({ order, open, onClose, onSuccess }: PackageAllocationModalProps) {
  const [items, setItems] = useState<AllocationItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build allocation items from order line items
  useEffect(() => {
    if (!open || !order.line_items) return;

    const allocItems: AllocationItem[] = order.line_items
      .map((li) => ({
        order_line_item_id: li.id,
        sku: li.sku || '',
        name: li.name,
        ordered: li.quantity,
        shipped: li.quantity_shipped || 0,
        remaining: li.quantity - (li.quantity_shipped || 0),
        allocate: li.quantity - (li.quantity_shipped || 0),
      }))
      .filter((item) => item.remaining > 0);

    setItems(allocItems);
    setError(null);
  }, [open, order]);

  const updateQuantity = (idx: number, value: number) => {
    setItems((prev) => {
      const next = [...prev];
      const item = next[idx];
      next[idx] = { ...item, allocate: Math.max(0, Math.min(value, item.remaining)) };
      return next;
    });
  };

  const totalAllocated = items.reduce((sum, i) => sum + i.allocate, 0);

  const handleSubmit = async () => {
    const toAllocate = items.filter((i) => i.allocate > 0);
    if (toAllocate.length === 0) {
      setError('No items to allocate');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const shippingAddr = order.shipping_address_json || undefined;

      await warehouseService.createPackage({
        order_id: order.id,
        line_items: toAllocate.map((i) => ({
          order_line_item_id: i.order_line_item_id,
          quantity: i.allocate,
        })),
        shipping_address: shippingAddr as Record<string, string> | undefined,
      });

      onSuccess();
    } catch (err) {
      console.error('Error creating package:', err);
      setError(err instanceof Error ? err.message : 'Failed to create package');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay
      isDismissable
      isOpen={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <Modal className="w-full max-w-2xl bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Package size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Send to Packing</h2>
                  <Badge variant="secondary" className="text-xs">
                    {order.salesorder_number}
                  </Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Customer info */}
                <div className="text-sm text-muted-foreground">
                  Customer: <span className="text-foreground font-medium">{order.customer_name}</span>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} />
                    {error}
                  </div>
                )}

                {/* Items table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">SKU</th>
                        <th className="text-left px-3 py-2 font-medium">Item</th>
                        <th className="text-right px-3 py-2 font-medium">Ordered</th>
                        <th className="text-right px-3 py-2 font-medium">Shipped</th>
                        <th className="text-right px-3 py-2 font-medium">Remaining</th>
                        <th className="text-right px-3 py-2 font-medium">Allocate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item, idx) => (
                        <tr key={item.order_line_item_id} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-3 py-2 truncate max-w-[200px]">{item.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.ordered}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{item.shipped}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.remaining}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={item.remaining}
                              value={item.allocate}
                              onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)}
                              className="w-16 text-right bg-background border rounded px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                            All items have been shipped
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Shipping address */}
                {order.shipping_address_json && (
                  <div className="text-sm">
                    <div className="font-medium mb-1">Shipping Address</div>
                    <div className="text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                      {[
                        (order.shipping_address_json as any)?.address,
                        (order.shipping_address_json as any)?.street2,
                        (order.shipping_address_json as any)?.city,
                        (order.shipping_address_json as any)?.state,
                        (order.shipping_address_json as any)?.zip,
                        (order.shipping_address_json as any)?.country,
                      ].filter(Boolean).join(', ')}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
                <span className="text-sm text-muted-foreground">
                  {totalAllocated} item{totalAllocated !== 1 ? 's' : ''} to pack
                </span>
                <div className="flex items-center gap-2">
                  <Button intent="outline" size="sm" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    intent="primary"
                    size="sm"
                    onPress={handleSubmit}
                    isDisabled={submitting || totalAllocated === 0}
                  >
                    {submitting ? (
                      <><Loader2 size={14} className="animate-spin" /> Creating...</>
                    ) : (
                      <><CheckCircle size={14} /> Create Package</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
