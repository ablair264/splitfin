// src/components/warehouse/PackingListEditModal.tsx
import { useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService, type Package } from '@/services/warehouseService';
import { Edit, X, CheckCircle, Loader2 } from 'lucide-react';

interface PackingListEditModalProps {
  pkg: Package;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PackingListEditModal({ pkg, open, onClose, onSuccess }: PackingListEditModalProps) {
  const [items, setItems] = useState<{ id: number; quantity_packed: number }[]>(
    (pkg.items || []).map((i) => ({ id: i.id, quantity_packed: i.quantity_packed }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateQuantity = (id: number, value: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity_packed: Math.max(0, value) } : i)));
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await warehouseService.updatePackageItems(pkg.id, items);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
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
      <Modal className="w-full max-w-lg bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Edit size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Edit Packing List</h2>
                  <Badge variant="secondary">{pkg.packing_number}</Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {error && (
                  <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 mb-4">
                    {error}
                  </div>
                )}

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-left pb-2">SKU</th>
                      <th className="text-left pb-2">Item</th>
                      <th className="text-right pb-2">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(pkg.items || []).map((item) => {
                      const editItem = items.find((i) => i.id === item.id);
                      return (
                        <tr key={item.id}>
                          <td className="py-2 font-mono text-xs">{item.sku}</td>
                          <td className="py-2 truncate max-w-[200px]">{item.item_name}</td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              value={editItem?.quantity_packed ?? item.quantity_packed}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                              className="w-16 text-right border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                <Button intent="outline" size="sm" onPress={close}>Cancel</Button>
                <Button intent="primary" size="sm" onPress={handleSave} isDisabled={submitting}>
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save</>}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
