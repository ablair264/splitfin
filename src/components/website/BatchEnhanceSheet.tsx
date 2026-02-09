import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  SheetContent, SheetHeader, SheetBody, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { websiteProductService } from '@/services/websiteProductService';
import type { WebsiteProduct, WebsiteCategory, BatchEnhanceResultItem } from '@/types/domain';

interface BatchEnhanceSheetProps {
  categories: WebsiteCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const POP_HOME_BRANDS = ['Relaxound', 'Remember', 'Ideas 4 Seasons', 'My Flame Lifestyle'];

export function BatchEnhanceSheet({
  categories, open, onOpenChange, onComplete,
}: BatchEnhanceSheetProps) {
  const [step, setStep] = useState<'configure' | 'processing' | 'results'>('configure');
  const [products, setProducts] = useState<WebsiteProduct[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [brandFilter, setBrandFilter] = useState('');
  const [maxProducts, setMaxProducts] = useState(25);
  const [onlyUnenhanced, setOnlyUnenhanced] = useState(true);

  // Options
  const [cleanNames, setCleanNames] = useState(true);
  const [generateDescs, setGenerateDescs] = useState(true);
  const [assignCats, setAssignCats] = useState(true);
  const [assignTags, setAssignTags] = useState(true);

  // Processing state
  const [results, setResults] = useState<BatchEnhanceResultItem[]>([]);
  const [processed, setProcessed] = useState(0);
  const cancelledRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('configure');
      setProducts([]);
      setBrandFilter('');
      setMaxProducts(25);
      setOnlyUnenhanced(true);
      setCleanNames(true);
      setGenerateDescs(true);
      setAssignCats(true);
      setAssignTags(true);
      setResults([]);
      setProcessed(0);
      cancelledRef.current = false;
      loadProducts();
    }
  }, [open]);

  // Reload when filters change
  useEffect(() => {
    if (open && step === 'configure') loadProducts();
  }, [brandFilter]);

  async function loadProducts() {
    setLoading(true);
    try {
      const filters: Record<string, string | number> = {
        limit: 200,
        offset: 0,
        sort_by: 'display_name',
        sort_order: 'asc',
        is_active: 'true',
      };
      if (brandFilter) filters.brand = brandFilter;

      const res = await websiteProductService.list(filters);
      setProducts(res.data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filter products that need enhancement
  const filteredProducts = products.filter((p) => {
    if (onlyUnenhanced) {
      // Consider "unenhanced" if display_name equals base_name (not cleaned) or no descriptions
      const nameNotCleaned = !p.display_name || p.display_name === p.base_name;
      const noDescription = !p.short_description && !p.long_description;
      return nameNotCleaned || noDescription;
    }
    return true;
  });

  const toProcess = filteredProducts.slice(0, maxProducts);
  const enhancedCount = products.filter(
    (p) => p.display_name && p.display_name !== p.base_name && p.short_description
  ).length;

  async function handleStart() {
    setStep('processing');
    setProcessed(0);
    cancelledRef.current = false;

    const batchSize = 10; // Process in batches of 10
    const allResults: BatchEnhanceResultItem[] = [];

    for (let i = 0; i < toProcess.length; i += batchSize) {
      if (cancelledRef.current) break;

      const batch = toProcess.slice(i, i + batchSize);
      const ids = batch.map((p) => p.id);

      try {
        const res = await websiteProductService.batchEnhance({
          website_product_ids: ids,
          options: {
            overwrite_names: cleanNames,
            overwrite_descriptions: generateDescs,
            assign_categories: assignCats,
            assign_tags: assignTags,
          },
        });
        allResults.push(...res.results);
      } catch (err) {
        // If batch fails, mark all as error
        for (const p of batch) {
          allResults.push({
            id: p.id,
            status: 'error',
            original_name: p.base_name || p.display_name || 'Unknown',
            error: err instanceof Error ? err.message : 'Batch failed',
          });
        }
      }

      setProcessed(Math.min(i + batchSize, toProcess.length));
      setResults([...allResults]);
    }

    setResults(allResults);
    setStep('results');
  }

  const successCount = results.filter((r) => r.status === 'done').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-[640px] w-full backdrop-blur-xl bg-card/95"
      aria-label="Batch enhance website products"
    >
      <SheetHeader className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3 pr-8">
          <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/10">
            <Sparkles size={16} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Batch Enhance Products</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clean names, generate descriptions, assign categories & tags
            </p>
          </div>
        </div>
      </SheetHeader>

      <SheetBody className="px-5 py-4 overflow-y-auto">
        {step === 'configure' && (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-background rounded-lg border border-border p-3 text-center">
                <div className="text-lg font-semibold text-foreground tabular-nums">{products.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
              </div>
              <div className="bg-background rounded-lg border border-border p-3 text-center">
                <div className="text-lg font-semibold text-emerald-400 tabular-nums">{enhancedCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Enhanced</div>
              </div>
              <div className="bg-background rounded-lg border border-border p-3 text-center">
                <div className="text-lg font-semibold text-amber-500 tabular-nums">{toProcess.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Will Process</div>
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Brand Filter</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All Brands</option>
                  {POP_HOME_BRANDS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Max Products</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxProducts}
                  onChange={(e) => setMaxProducts(Math.max(1, Math.min(50, parseInt(e.target.value) || 25)))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyUnenhanced}
                  onChange={(e) => setOnlyUnenhanced(e.target.checked)}
                  className="rounded border-border bg-background text-primary focus:ring-primary/30"
                />
                <span className="text-sm text-foreground/80">Only products needing enhancement</span>
              </label>
            </div>

            {/* Enhancement options */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Enhancement Options
              </h4>
              {[
                { label: 'Clean product names', desc: 'Strip brand, promo tags, dimensions; extract colour', state: cleanNames, set: setCleanNames },
                { label: 'Generate descriptions', desc: 'Short + long descriptions where missing', state: generateDescs, set: setGenerateDescs },
                { label: 'Assign categories', desc: 'Auto-assign best matching website category', state: assignCats, set: setAssignCats },
                { label: 'Suggest tags', desc: 'Auto-generate relevant product tags', state: assignTags, set: setAssignTags },
              ].map(({ label, desc, state, set }) => (
                <label key={label} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state}
                    onChange={(e) => set(e.target.checked)}
                    className="mt-0.5 rounded border-border bg-background text-primary focus:ring-primary/30"
                  />
                  <div>
                    <span className="text-sm text-foreground/90">{label}</span>
                    <p className="text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground/80">
                  Processing {processed} / {toProcess.length}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round((processed / (toProcess.length || 1)) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-background rounded-full border border-border overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${(processed / (toProcess.length || 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* Results list */}
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {results.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                  {r.status === 'done' && <CheckCircle size={13} className="text-emerald-400 shrink-0" />}
                  {r.status === 'error' && <AlertTriangle size={13} className="text-destructive shrink-0" />}
                  <span className={cn(
                    'truncate flex-1',
                    r.status === 'done' ? 'text-foreground/80' : 'text-destructive'
                  )}>
                    {r.original_name}
                  </span>
                  {r.status === 'done' && r.display_name && r.display_name !== r.original_name && (
                    <span className="flex items-center gap-1 text-emerald-400 shrink-0 max-w-[40%] truncate">
                      <ArrowRight size={10} />
                      {r.display_name}
                    </span>
                  )}
                </div>
              ))}
              {processed < toProcess.length && !cancelledRef.current && (
                <div className="flex items-center gap-2 py-1 text-[12px]">
                  <Loader2 size={13} className="animate-spin text-amber-500 shrink-0" />
                  <span className="text-muted-foreground">Processing...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                <div className="text-xl font-semibold text-emerald-400 tabular-nums">{successCount}</div>
                <div className="text-[11px] text-emerald-400/70">Enhanced</div>
              </div>
              {errorCount > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
                  <div className="text-xl font-semibold text-destructive tabular-nums">{errorCount}</div>
                  <div className="text-[11px] text-destructive/70">Failed</div>
                </div>
              )}
            </div>

            {/* Sample results */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {results.filter((r) => r.status === 'done').slice(0, 15).map((r) => (
                <div key={r.id} className="bg-background rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    {r.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        {r.category}
                      </span>
                    )}
                    {r.colour && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border flex items-center gap-1">
                        <span
                          className="inline-block size-2 rounded-full border border-border"
                          style={{ backgroundColor: r.colour?.toLowerCase() || '#ccc' }}
                        />
                        {r.colour}
                      </span>
                    )}
                    {r.tags && r.tags.length > 0 && r.tags.map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground line-through mb-0.5">
                    {r.original_name}
                  </div>
                  <div className="text-[13px] font-medium text-foreground">
                    {r.display_name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetBody>

      <SheetFooter className="border-t border-border/60 px-5 py-3">
        <div className="flex items-center justify-end gap-2 w-full">
          {step === 'configure' && (
            <>
              <Button intent="outline" size="sm" onPress={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                intent="primary"
                size="sm"
                onPress={handleStart}
                isDisabled={toProcess.length === 0 || loading}
              >
                <Sparkles size={14} className="mr-1" />
                Enhance {toProcess.length} Product{toProcess.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {step === 'processing' && (
            <Button
              intent="danger"
              size="sm"
              onPress={() => { cancelledRef.current = true; }}
            >
              Stop
            </Button>
          )}
          {step === 'results' && (
            <Button
              intent="primary"
              size="sm"
              onPress={() => { onComplete(); onOpenChange(false); }}
            >
              Done
            </Button>
          )}
        </div>
      </SheetFooter>
    </SheetContent>
  );
}
