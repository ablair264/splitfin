import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onedriveService } from "@/services/onedriveService";
import { productService } from "@/services/productService";
import { Check, CircleAlert, Loader2, Search, X } from "lucide-react";

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

// Flat row for the table view
interface FlatRow {
  productId: number;
  productName: string;
  brand: string;
  sku: string;
  imageId: string;
  fileName: string;
  fileSize: number;
}

// Import progress entry per product
interface ImportProgress {
  productId: number;
  productName: string;
  imageCount: number;
  status: "pending" | "importing" | "done" | "error";
  error?: string;
}

type ModalStep = "select" | "importing" | "done";

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
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [showOnlyMatches, setShowOnlyMatches] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // "productId:imageId"
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [brandFilter, setBrandFilter] = useState("");
  const [started, setStarted] = useState(false);

  // Import progress state
  const [step, setStep] = useState<ModalStep>("select");
  const [progress, setProgress] = useState<ImportProgress[]>([]);
  const [importSummary, setImportSummary] = useState<{ total: number; success: number; errors: number } | null>(null);

  const offsetRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    productService.getBrands().then(setBrands).catch(() => {});
    setItems([]);
    setSelected(new Set());
    setError(null);
    setHasMore(false);
    setStarted(false);
    setBrandFilter("");
    setStep("select");
    setProgress([]);
    setImportSummary(null);
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
    setSelected(new Set());
    offsetRef.current = 0;
    doLoad(true, brandFilter);
  };

  // Flatten items into rows
  const rows = useMemo(() => {
    const filtered = showOnlyMatches ? items.filter((i) => i.matches?.length > 0) : items;
    const flat: FlatRow[] = [];
    for (const item of filtered) {
      for (const m of item.matches) {
        flat.push({
          productId: item.product.id,
          productName: item.product.name,
          brand: item.product.brand,
          sku: item.product.sku || "",
          imageId: m.id,
          fileName: m.name,
          fileSize: m.size,
        });
      }
    }
    return flat;
  }, [items, showOnlyMatches]);

  const makeKey = (productId: number, imageId: string) => `${productId}:${imageId}`;

  const toggleRow = (row: FlatRow) => {
    const key = makeKey(row.productId, row.imageId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(makeKey(r.productId, r.imageId)));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => makeKey(r.productId, r.imageId))));
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;

    // Group selected by product
    const byProduct = new Map<number, { item: MatchMissingItem; imageIds: Set<string> }>();
    for (const key of selected) {
      const [pidStr, imageId] = key.split(":");
      const pid = Number(pidStr);
      if (!byProduct.has(pid)) {
        const item = items.find((i) => i.product.id === pid);
        if (!item) continue;
        byProduct.set(pid, { item, imageIds: new Set() });
      }
      byProduct.get(pid)!.imageIds.add(imageId);
    }

    // Build progress list
    const progressList: ImportProgress[] = [];
    for (const [pid, { item, imageIds }] of byProduct) {
      progressList.push({
        productId: pid,
        productName: item.product.name,
        imageCount: imageIds.size,
        status: "pending",
      });
    }

    setProgress(progressList);
    setStep("importing");

    let successCount = 0;
    let errorCount = 0;

    const entries = Array.from(byProduct.entries());
    for (let i = 0; i < entries.length; i++) {
      const [pid, { item, imageIds }] = entries[i];

      // Mark current as importing
      setProgress((prev) => prev.map((p) => (p.productId === pid ? { ...p, status: "importing" } : p)));

      try {
        const selectedImages = item.matches.filter((m) => imageIds.has(m.id));
        if (selectedImages.length === 0) {
          setProgress((prev) => prev.map((p) => (p.productId === pid ? { ...p, status: "done" } : p)));
          successCount++;
          continue;
        }

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

        setProgress((prev) => prev.map((p) => (p.productId === pid ? { ...p, status: "done" } : p)));
        successCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Failed";
        setProgress((prev) => prev.map((p) => (p.productId === pid ? { ...p, status: "error", error: errMsg } : p)));
        errorCount++;
      }
    }

    setImportSummary({ total: entries.length, success: successCount, errors: errorCount });
    setStep("done");
    if (successCount > 0) onImported?.();
  };

  const handleClose = () => {
    onClose();
  };

  if (!open) return null;

  return (
    <ModalOverlay isOpen isDismissable={false} className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm">
      <Modal className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <Dialog role="alertdialog" className="w-full max-w-5xl rounded-xl border border-border bg-card shadow-xl">
          {/* ───── STEP 1: Select ───── */}
          {step === "select" && (
            <>
              <DialogHeader>
                <DialogTitle>Match Missing Images</DialogTitle>
                <DialogDescription>
                  Products without images matched by SKU against OneDrive.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="pt-0">
                {/* Toolbar */}
                <div className="flex items-end gap-3 mb-3">
                  <div className="min-w-[180px]">
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
                  <Button intent="primary" size="sm" onPress={handleStart} isDisabled={loading}>
                    {loading ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Search className="size-3.5 mr-1.5" />}
                    {started ? "Re-match" : "Start Matching"}
                  </Button>
                  {started && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                      <input
                        type="checkbox"
                        checked={showOnlyMatches}
                        onChange={(e) => setShowOnlyMatches(e.target.checked)}
                        className="rounded border-border"
                      />
                      Only with matches
                    </label>
                  )}
                </div>

                {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

                {/* Loading */}
                {loading && items.length === 0 && (
                  <div className="flex items-center gap-2 py-12 justify-center text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Searching OneDrive for SKU matches...
                  </div>
                )}

                {/* Not started */}
                {!started && !loading && (
                  <div className="text-sm text-muted-foreground py-12 text-center">
                    Pick a brand and click &quot;Start Matching&quot;.
                  </div>
                )}

                {/* Empty */}
                {started && !loading && rows.length === 0 && items.length === 0 && (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    No products without images found{brandFilter ? ` for ${brandFilter}` : ""}.
                  </div>
                )}

                {/* Table */}
                {rows.length > 0 && (
                  <div className="border border-border/60 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 text-left text-xs text-muted-foreground border-b border-border/60">
                          <th className="p-2 w-8">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={toggleSelectAll}
                              className="rounded"
                            />
                          </th>
                          <th className="p-2">Product</th>
                          <th className="p-2">SKU</th>
                          <th className="p-2">OneDrive File</th>
                          <th className="p-2 text-right w-24">Size</th>
                        </tr>
                      </thead>
                    </table>
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {rows.map((row) => {
                            const key = makeKey(row.productId, row.imageId);
                            const checked = selected.has(key);
                            return (
                              <tr
                                key={key}
                                className={`border-b border-border/30 cursor-pointer transition-colors ${checked ? "bg-teal-500/5" : "hover:bg-muted/20"}`}
                                onClick={() => toggleRow(row)}
                              >
                                <td className="p-2 w-8" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleRow(row)}
                                    className="rounded"
                                  />
                                </td>
                                <td className="p-2 truncate max-w-[220px]" title={row.productName}>
                                  <span className="text-foreground">{row.productName}</span>
                                  <span className="text-muted-foreground text-xs ml-1.5">{row.brand}</span>
                                </td>
                                <td className="p-2 text-muted-foreground font-mono text-xs">{row.sku}</td>
                                <td className="p-2 truncate max-w-[240px] text-foreground" title={row.fileName}>{row.fileName}</td>
                                <td className="p-2 text-right text-muted-foreground tabular-nums text-xs">{(row.fileSize / 1024).toFixed(0)} KB</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Loading more */}
                {loading && items.length > 0 && (
                  <div className="flex items-center gap-2 py-3 justify-center text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading more...
                  </div>
                )}

                {hasMore && !loading && (
                  <div className="flex justify-center mt-3">
                    <Button intent="outline" size="sm" onPress={() => doLoad(false, brandFilter)}>
                      Load more
                    </Button>
                  </div>
                )}
              </DialogBody>
              <DialogFooter>
                <div className="flex items-center gap-3 w-full">
                  <span className="text-xs text-muted-foreground">
                    {rows.length} matches · {selected.size} selected
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button intent="outline" size="sm" onPress={handleClose}>
                      Close
                    </Button>
                    <Button intent="primary" size="sm" onPress={handleImport} isDisabled={selected.size === 0}>
                      Import {selected.size}
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </>
          )}

          {/* ───── STEP 2: Importing (progress) ───── */}
          {step === "importing" && (
            <>
              <DialogHeader>
                <DialogTitle>Importing Images</DialogTitle>
                <DialogDescription>
                  Importing {progress.length} product{progress.length !== 1 ? "s" : ""} from OneDrive...
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="pt-0">
                <ImportProgressView progress={progress} />
              </DialogBody>
              <DialogFooter>
                <span className="text-xs text-muted-foreground">
                  {progress.filter((p) => p.status === "done" || p.status === "error").length} of {progress.length} complete
                </span>
              </DialogFooter>
            </>
          )}

          {/* ───── STEP 3: Done ───── */}
          {step === "done" && importSummary && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {importSummary.errors === 0 ? "Import Complete" : "Import Finished"}
                </DialogTitle>
                <DialogDescription>
                  {importSummary.errors === 0
                    ? `Successfully imported images for ${importSummary.success} product${importSummary.success !== 1 ? "s" : ""}.`
                    : `${importSummary.success} succeeded, ${importSummary.errors} failed.`}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="pt-0">
                {/* Summary icon */}
                <div className="flex flex-col items-center py-6 gap-3">
                  {importSummary.errors === 0 ? (
                    <div className="size-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Check className="size-7 text-emerald-500" />
                    </div>
                  ) : (
                    <div className="size-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <CircleAlert className="size-7 text-amber-500" />
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-foreground tabular-nums">
                      {importSummary.success}/{importSummary.total}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">products imported</div>
                  </div>
                </div>

                {/* Show errors if any */}
                {importSummary.errors > 0 && (
                  <div className="border border-border/60 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    {progress.filter((p) => p.status === "error").map((p) => (
                      <div key={p.productId} className="flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-0 text-sm">
                        <X className="size-3.5 text-red-400 shrink-0" />
                        <span className="text-foreground truncate">{p.productName}</span>
                        <span className="text-red-400 text-xs ml-auto shrink-0">{p.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </DialogBody>
              <DialogFooter>
                <div className="ml-auto">
                  <Button intent="primary" size="sm" onPress={handleClose}>
                    Done
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** Progress list shown during import */
function ImportProgressView({ progress }: { progress: ImportProgress[] }) {
  const doneCount = progress.filter((p) => p.status === "done" || p.status === "error").length;
  const pct = progress.length > 0 ? Math.round((doneCount / progress.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{doneCount} of {progress.length} products</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Product list */}
      <div className="border border-border/60 rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
        {progress.map((p) => (
          <div
            key={p.productId}
            className="flex items-center gap-2.5 px-3 py-2 border-b border-border/30 last:border-0"
          >
            {/* Status icon */}
            {p.status === "pending" && (
              <div className="size-4 rounded-full border border-border/60 shrink-0" />
            )}
            {p.status === "importing" && (
              <Loader2 className="size-4 text-teal-500 animate-spin shrink-0" />
            )}
            {p.status === "done" && (
              <Check className="size-4 text-emerald-500 shrink-0" />
            )}
            {p.status === "error" && (
              <X className="size-4 text-red-400 shrink-0" />
            )}

            {/* Product info */}
            <span className={`text-sm truncate ${p.status === "importing" ? "text-foreground" : "text-muted-foreground"}`}>
              {p.productName}
            </span>

            {/* Image count */}
            <span className="text-xs text-muted-foreground ml-auto shrink-0 tabular-nums">
              {p.imageCount} image{p.imageCount !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
