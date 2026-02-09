import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Loader2, Layers, Check } from 'lucide-react';
import {
  SheetContent, SheetHeader, SheetBody, SheetFooter, SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { websiteProductService } from '@/services/websiteProductService';
import type { Product, WebsiteCategory } from '@/types/domain';

interface BatchAddWebsiteProductSheetProps {
  categories: WebsiteCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const POP_HOME_BRANDS = ['Relaxound', 'Remember', 'Ideas 4 Seasons', 'My Flame Lifestyle'];

export function BatchAddWebsiteProductSheet({
  categories, open, onOpenChange, onCreated,
}: BatchAddWebsiteProductSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Defaults
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [markup, setMarkup] = useState('2.0');
  const [badge, setBadge] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setBrandFilter('');
      setProducts([]);
      setTotalAvailable(0);
      setSelectedIds(new Set());
      setCategoryId(null);
      setMarkup('2.0');
      setBadge('');
      setIsActive(true);
      setResult(null);
      setError(null);
    }
  }, [open]);

  // Fetch available products when search/brand changes
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const filters: { search?: string; brand?: string; limit: number; offset: number } = {
          limit: 50,
          offset: 0,
        };
        if (searchQuery.length >= 2) filters.search = searchQuery;
        if (brandFilter) filters.brand = brandFilter;

        const res = await websiteProductService.getAvailableProducts(filters);
        setProducts(res.data);
        setTotalAvailable(res.meta?.total ?? res.count);
      } catch (err) {
        console.error('Failed to fetch available products:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open, searchQuery, brandFilter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || products.length >= totalAvailable) return;
    setLoadingMore(true);
    try {
      const filters: { search?: string; brand?: string; limit: number; offset: number } = {
        limit: 50,
        offset: products.length,
      };
      if (searchQuery.length >= 2) filters.search = searchQuery;
      if (brandFilter) filters.brand = brandFilter;

      const res = await websiteProductService.getAvailableProducts(filters);
      setProducts((prev) => [...prev, ...res.data]);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, products.length, totalAvailable, searchQuery, brandFilter]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (products.every((p) => selectedIds.has(p.id))) {
      // Deselect all visible
      setSelectedIds((prev) => {
        const next = new Set(prev);
        products.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds((prev) => {
        const next = new Set(prev);
        products.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }, [products, selectedIds]);

  const allVisibleSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));
  const someVisibleSelected = products.some((p) => selectedIds.has(p.id));

  const handleSubmit = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await websiteProductService.batchCreate({
        product_ids: Array.from(selectedIds),
        defaults: {
          category_id: categoryId ?? undefined,
          badge: badge || undefined,
          is_active: isActive,
          markup: parseFloat(markup) || 2.0,
        },
      });
      setResult({ created: res.created, skipped: res.skipped });
      onCreated();
      // Auto-close after short delay
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Batch add failed');
    } finally {
      setSubmitting(false);
    }
  }, [selectedIds, categoryId, badge, isActive, markup, onCreated, onOpenChange]);

  const formatPrice = (rate: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(rate);

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-[640px] w-full backdrop-blur-xl bg-card/95"
      aria-label="Batch add website products"
    >
      <SheetHeader className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3 pr-8">
          <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10">
            <Layers size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Batch Add Products</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select wholesale products to add to the website
            </p>
          </div>
        </div>
      </SheetHeader>

      <SheetBody className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
        {/* Search + Brand filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              autoFocus
            />
          </div>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          >
            <option value="">All Brands</option>
            {POP_HOME_BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Selection summary */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {totalAvailable} available{brandFilter ? ` (${brandFilter})` : ''}
          </span>
          <span className={cn(
            'font-medium tabular-nums',
            selectedIds.size > 0 ? 'text-primary' : 'text-muted-foreground'
          )}>
            {selectedIds.size} selected
          </span>
        </div>

        {/* Product list */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto border border-border/40 rounded-lg divide-y divide-border/30">
          {/* Select all header */}
          <button
            onClick={toggleSelectAll}
            className="w-full flex items-center gap-3 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left sticky top-0 z-10"
          >
            <div className={cn(
              'flex items-center justify-center size-4 rounded border transition-colors shrink-0',
              allVisibleSelected ? 'bg-primary border-primary text-primary-foreground' :
              someVisibleSelected ? 'bg-primary/30 border-primary/50' : 'border-border'
            )}>
              {(allVisibleSelected || someVisibleSelected) && <Check size={10} />}
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {allVisibleSelected ? 'Deselect all' : 'Select all on page'}
            </span>
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {searchQuery.length >= 2 ? 'No products found' : 'Start typing or select a brand to browse'}
            </div>
          ) : (
            <>
              {products.map((product) => {
                const isSelected = selectedIds.has(product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => toggleSelect(product.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 transition-colors text-left',
                      isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                    )}
                  >
                    <div className={cn(
                      'flex items-center justify-center size-4 rounded border transition-colors shrink-0',
                      isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                    )}>
                      {isSelected && <Check size={10} />}
                    </div>
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="size-8 shrink-0 rounded object-cover bg-muted" loading="lazy" />
                    ) : (
                      <div className="size-8 shrink-0 rounded bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">{product.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono">{product.sku}</span>
                        <span className="text-[10px] text-primary/70">{product.brand}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {product.rate ? formatPrice(product.rate) : '—'}
                      </div>
                      <div className={cn('text-[10px] tabular-nums', (product.stock_on_hand ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {product.stock_on_hand ?? 0} in stock
                      </div>
                    </div>
                  </button>
                );
              })}
              {products.length < totalAvailable && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                >
                  {loadingMore ? (
                    <Loader2 size={13} className="animate-spin mx-auto" />
                  ) : (
                    `Load more (${products.length} of ${totalAvailable})`
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Defaults */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Defaults for all selected
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
              <select
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              >
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Markup</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  className="w-full px-2 pr-6 py-1.5 rounded-md bg-background border border-border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">x</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Badge</label>
              <select
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              >
                <option value="">None</option>
                <option value="new">New</option>
                <option value="sale">Sale</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <button
                onClick={() => setIsActive(!isActive)}
                className={cn('w-full px-2 py-1.5 rounded-md text-sm font-medium border transition-colors', isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-background text-muted-foreground border-border')}
              >
                {isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        </div>
      </SheetBody>

      <SheetFooter className="border-t border-border/60 px-5 py-3">
        <div className="flex items-center justify-between w-full">
          <div>
            {error && <span className="text-xs text-destructive">{error}</span>}
            {result && (
              <span className="text-xs text-emerald-400">
                Added {result.created} products{result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SheetClose>
              <Button intent="outline" size="sm">Cancel</Button>
            </SheetClose>
            <Button
              intent="primary"
              size="sm"
              onPress={handleSubmit}
              isDisabled={submitting || selectedIds.size === 0}
            >
              {submitting && <Loader2 size={13} className="animate-spin mr-1" />}
              Add {selectedIds.size} Product{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </SheetFooter>
    </SheetContent>
  );
}
