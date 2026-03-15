// src/components/warehouse/PackingScanModal.tsx
import { useState, useEffect, useRef } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService, type Package, type PackageItem } from '@/services/warehouseService';
import { ScanLine, X, CheckCircle, Package as PackageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PackingScanModalProps {
  pkg: Package;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PackingScanModal({ pkg, open, onClose, onSuccess }: PackingScanModalProps) {
  const [items, setItems] = useState<PackageItem[]>(pkg.items || []);
  const [scanInput, setScanInput] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setItems(pkg.items || []);
      setScanInput('');
      setLastResult(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, pkg]);

  const handleScan = async (code: string) => {
    if (!code.trim()) return;
    setScanInput('');

    try {
      const result = await warehouseService.scanItem(pkg.id, code.trim());
      if (result.result === 'matched' && result.item) {
        setItems((prev) =>
          prev.map((i) => (i.id === result.item!.id ? result.item! : i))
        );
        setLastResult(`Scanned: ${result.item.item_name}`);
      } else if (result.result === 'already_complete') {
        setLastResult(`Already complete: ${code}`);
      } else {
        setLastResult(`Not found: ${code}`);
      }
    } catch (err) {
      setLastResult(`Error scanning: ${code}`);
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan(scanInput);
    }
  };

  const handleMarkAllPacked = async () => {
    setMarking(true);
    try {
      await warehouseService.markPacked(pkg.id);
      onSuccess();
    } catch (err) {
      setLastResult('Failed to mark as packed');
    } finally {
      setMarking(false);
    }
  };

  const totalExpected = items.reduce((sum, i) => sum + (i.ordered_quantity || i.quantity_packed || 0), 0);
  const totalScanned = items.reduce((sum, i) => sum + (i.quantity_packed || 0), 0);
  const allComplete = totalScanned >= totalExpected && totalExpected > 0;

  if (!open) return null;

  return (
    <ModalOverlay
      isDismissable
      isOpen={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <Modal className="w-full max-w-xl bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <ScanLine size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Scan Items</h2>
                  <Badge variant="secondary">{pkg.packing_number}</Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Scan input */}
              <div className="px-6 py-3 border-b bg-muted/20">
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scan barcode or enter SKU..."
                  className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                {lastResult && (
                  <div className={cn(
                    'text-xs mt-1',
                    lastResult.startsWith('Scanned') ? 'text-emerald-500' : 'text-amber-500',
                  )}>
                    {lastResult}
                  </div>
                )}
              </div>

              {/* Progress */}
              <div className="px-6 py-2 border-b">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span className="tabular-nums">{totalScanned} / {totalExpected}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      allComplete ? 'bg-emerald-500' : 'bg-primary',
                    )}
                    style={{ width: `${totalExpected ? (totalScanned / totalExpected) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto px-6 py-3">
                <div className="space-y-1">
                  {items.map((item) => {
                    const expected = item.ordered_quantity || item.quantity_packed || 0;
                    const scanned = item.quantity_packed || 0;
                    const complete = scanned >= expected;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                          complete ? 'bg-emerald-500/5' : 'bg-muted/30',
                        )}
                      >
                        {complete ? (
                          <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                        ) : (
                          <PackageIcon size={14} className="text-muted-foreground shrink-0" />
                        )}
                        <span className="font-mono text-xs text-muted-foreground w-16">{item.sku}</span>
                        <span className="flex-1 truncate">{item.item_name}</span>
                        <span className="tabular-nums text-xs">
                          {scanned}/{expected}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                <Button intent="outline" size="sm" onPress={close}>Cancel</Button>
                <Button
                  intent="primary"
                  size="sm"
                  onPress={handleMarkAllPacked}
                  isDisabled={marking}
                >
                  <CheckCircle size={14} />
                  {marking ? 'Marking...' : 'Mark All Packed'}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
