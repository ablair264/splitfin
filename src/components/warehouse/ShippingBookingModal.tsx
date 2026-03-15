// src/components/warehouse/ShippingBookingModal.tsx
import { useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService, type Package } from '@/services/warehouseService';
import { Truck, X, CheckCircle, Loader2 } from 'lucide-react';

interface ShippingBookingModalProps {
  pkg: Package;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ShippingBookingModal({ pkg, open, onClose, onSuccess }: ShippingBookingModalProps) {
  const [carrier, setCarrier] = useState(pkg.carrier_name || '');
  const [tracking, setTracking] = useState(pkg.tracking_number || '');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!carrier.trim()) {
      setError('Carrier is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await warehouseService.bookDelivery(pkg.id, carrier, tracking, deliveryDate, notes);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book delivery');
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
      <Modal className="w-full max-w-md bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Truck size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Book Delivery</h2>
                  <Badge variant="secondary">{pkg.packing_number}</Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4 space-y-4">
                {error && (
                  <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Carrier *</label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. DPD, Royal Mail, UPS"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tracking Number</label>
                  <input
                    type="text"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                    placeholder="Enter tracking number"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Additional shipping notes..."
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                <Button intent="outline" size="sm" onPress={close}>Cancel</Button>
                <Button intent="primary" size="sm" onPress={handleSubmit} isDisabled={submitting}>
                  {submitting ? (
                    <><Loader2 size={14} className="animate-spin" /> Booking...</>
                  ) : (
                    <><CheckCircle size={14} /> Book Delivery</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
