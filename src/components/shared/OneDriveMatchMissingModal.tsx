import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onedriveService } from "@/services/onedriveService";
import { cn } from "@/lib/utils";

interface MatchMissingItem {
  product: {
    id: number;
    sku: string | null;
    name: string;
    brand: string;
    image_url: string | null;
  };
  matches: {
    id: string;
    name: string;
    size: number;
    mimeType: string | null;
    webUrl: string | null;
    createdDateTime: string | null;
    lastModifiedDateTime: string | null;
  }[];
  reason?: string;
}

export function OneDriveMatchMissingModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const [items, setItems] = useState<MatchMissingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showOnlyMatches, setShowOnlyMatches] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<number, Set<string>>>({});

  const loadItems = useCallback(
    async (reset = false) => {
      if (loading) return;
      setLoading(true);
      setError(null);
      try {
        const nextOffset = reset ? 0 : offset;
        const result = await onedriveService.matchMissing({
          limit: 20,
          offset: nextOffset,
        });
        const nextItems = result.data || [];
        setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
        setOffset(nextOffset + nextItems.length);
        setHasMore(nextItems.length === 20);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to match missing images.");
      } finally {
        setLoading(false);
      }
    },
    [loading, offset]
  );

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setSelectedMap({});
    setOffset(0);
    setHasMore(true);
    loadItems(true);
  }, [open, loadItems]);

  const filteredItems = useMemo(
    () => (showOnlyMatches ? items.filter((i) => i.matches?.length > 0) : items),
    [items, showOnlyMatches]
  );

  const totalSelected = useMemo(
    () => Object.values(selectedMap).reduce((sum, set) => sum + set.size, 0),
    [selectedMap]
  );

  const toggleSelect = (productId: number, imageId: string) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      const set = new Set(next[productId] || []);
      if (set.has(imageId)) set.delete(imageId);
      else set.add(imageId);
      next[productId] = set;
      return next;
    });
  };

  const toggleSelectAllForProduct = (productId: number, imageIds: string[]) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      const set = new Set(next[productId] || []);
      if (set.size === imageIds.length) {
        next[productId] = new Set();
      } else {
        next[productId] = new Set(imageIds);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (importing || totalSelected === 0) return;
    setImporting(true);
    setError(null);
    try {
      for (const item of filteredItems) {
        const selected = selectedMap[item.product.id];
        if (!selected || selected.size === 0) continue;
        const selectedImages = item.matches.filter((m) => selected.has(m.id));
        if (selectedImages.length === 0) continue;
        await onedriveService.importImages({
          brand: item.product.brand,
          product_id: item.product.id,
          items: selectedImages.map((m) => ({
            id: m.id,
            name: m.name,
            mimeType: m.mimeType,
            matched_sku: item.product.sku || undefined,
            sku_confidence: 1,
            original_filename: m.name,
          })),
        });
      }
      onImported?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay isDismissable={false} className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm">
      <Modal className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <Dialog role="alertdialog" className="w-full max-w-5xl rounded-xl border border-border bg-card shadow-xl">
          <DialogHeader>
            <DialogTitle>Match Missing Images (OneDrive)</DialogTitle>
            <DialogDescription>
              Active products without images are matched by SKU. Select results to import.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-0">
            <div className="flex items-center justify-between gap-3 mb-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showOnlyMatches}
                  onChange={(e) => setShowOnlyMatches(e.target.checked)}
                  className="rounded border-border"
                />
                Show only products with matches
              </label>
              <div className="text-xs text-muted-foreground">
                Selected: <span className="text-foreground font-medium">{totalSelected}</span>
              </div>
            </div>

            {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

            {loading && items.length === 0 ? (
              <div className="text-sm text-muted-foreground">Matching products…</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-sm text-muted-foreground">No matches found.</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-border/40 border border-border/60 rounded-lg">
                {filteredItems.map((item) => {
                  const imageIds = item.matches.map((m) => m.id);
                  const selected = selectedMap[item.product.id] || new Set();
                  return (
                    <div key={item.product.id} className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.product.brand} · {item.product.sku || "No SKU"}
                          </div>
                        </div>
                        {item.matches.length > 0 && (
                          <button
                            className="text-xs text-primary/80 hover:text-primary"
                            onClick={() => toggleSelectAllForProduct(item.product.id, imageIds)}
                          >
                            {selected.size === imageIds.length ? "Clear all" : "Select all"}
                          </button>
                        )}
                      </div>

                      {item.matches.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {item.reason ? `No matches (${item.reason})` : "No matches found."}
                        </div>
                      ) : (
                        <div className="border border-border/60 rounded-md overflow-hidden">
                          <div className="grid grid-cols-[36px_1fr_120px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                            <span />
                            <span>File</span>
                            <span>Size</span>
                          </div>
                          {item.matches.map((m) => (
                            <label
                              key={m.id}
                              className={cn(
                                "grid grid-cols-[36px_1fr_120px] gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/20"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(m.id)}
                                onChange={() => toggleSelect(item.product.id, m.id)}
                              />
                              <span className="truncate">{m.name}</span>
                              <span className="text-xs text-muted-foreground">{(m.size / 1024).toFixed(1)} KB</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {hasMore && (
              <div className="flex justify-center mt-3">
                <Button intent="outline" size="sm" onPress={() => loadItems(false)} isDisabled={loading}>
                  {loading ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button intent="outline" size="sm" onPress={onClose}>
              Close
            </Button>
            <Button intent="primary" size="sm" onPress={handleImport} isDisabled={importing || totalSelected === 0}>
              {importing ? "Importing…" : "Import Selected"}
            </Button>
          </DialogFooter>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
