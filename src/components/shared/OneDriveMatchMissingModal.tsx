import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onedriveService } from "@/services/onedriveService";
import { productService } from "@/services/productService";
import { cn } from "@/lib/utils";
import { Loader2, Search } from "lucide-react";

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
  const [hasMore, setHasMore] = useState(false);
  const [showOnlyMatches, setShowOnlyMatches] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<number, Set<string>>>({});
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [brandFilter, setBrandFilter] = useState("");
  const [started, setStarted] = useState(false);

  // Use a ref to track offset so it doesn't cause re-renders / effect loops
  const offsetRef = useRef(0);

  // Load brands on open
  useEffect(() => {
    if (!open) return;
    productService.getBrands().then(setBrands).catch(() => {});
    // Reset state when opening
    setItems([]);
    setSelectedMap({});
    setError(null);
    setHasMore(false);
    setStarted(false);
    setBrandFilter("");
    offsetRef.current = 0;
  }, [open]);

  const doLoad = useCallback(async (reset: boolean, brand: string) => {
    setLoading(true);
    setError(null);
    try {
      const nextOffset = reset ? 0 : offsetRef.current;
      const params: { limit: number; offset: number; brand?: string } = {
        limit: 20,
        offset: nextOffset,
      };
      if (brand) params.brand = brand;

      const result = await onedriveService.matchMissing(params);
      const nextItems = result.data || [];
      setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      offsetRef.current = nextOffset + nextItems.length;
      setHasMore(nextItems.length === 20);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to match missing images.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStart = () => {
    setStarted(true);
    setItems([]);
    setSelectedMap({});
    offsetRef.current = 0;
    doLoad(true, brandFilter);
  };

  const handleLoadMore = () => {
    doLoad(false, brandFilter);
  };

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
              Find OneDrive images matching products that have no images, by SKU.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-0">
            {/* Brand filter + start */}
            <div className="flex items-end gap-3 mb-4">
              <div className="flex-1 max-w-xs">
                <label className="text-xs text-muted-foreground block mb-1">Brand</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  disabled={loading}
                  className="w-full h-8 px-2 text-sm rounded-md border border-border bg-background text-foreground"
                >
                  <option value="">All brands</option>
                  {brands.map((b) => (
                    <option key={b.brand} value={b.brand}>
                      {b.brand} ({b.count})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                intent="primary"
                size="sm"
                onPress={handleStart}
                isDisabled={loading}
              >
                {loading && !started ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Search className="size-3.5 mr-1.5" />
                )}
                {started ? "Re-match" : "Start Matching"}
              </Button>
            </div>

            {/* Controls row */}
            {started && (
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
                  {items.length} products checked · Selected: <span className="text-foreground font-medium">{totalSelected}</span>
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

            {/* Loading state */}
            {loading && items.length === 0 && (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching OneDrive for SKU matches...
              </div>
            )}

            {/* Not started yet */}
            {!started && !loading && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Select a brand (optional) and click "Start Matching" to find OneDrive images for products without images.
              </div>
            )}

            {/* Results */}
            {started && !loading && items.length === 0 && (
              <div className="text-sm text-muted-foreground py-4">No products without images found{brandFilter ? ` for ${brandFilter}` : ""}.</div>
            )}

            {started && filteredItems.length > 0 && (
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

            {/* Loading more indicator */}
            {loading && items.length > 0 && (
              <div className="flex items-center gap-2 py-3 justify-center text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading more...
              </div>
            )}

            {hasMore && !loading && (
              <div className="flex justify-center mt-3">
                <Button intent="outline" size="sm" onPress={handleLoadMore}>
                  Load more
                </Button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button intent="outline" size="sm" onPress={onClose}>
              Close
            </Button>
            <Button intent="primary" size="sm" onPress={handleImport} isDisabled={importing || totalSelected === 0}>
              {importing ? "Importing..." : `Import ${totalSelected > 0 ? totalSelected : ""} Selected`}
            </Button>
          </DialogFooter>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
