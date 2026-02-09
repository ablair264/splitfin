import { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, ArrowLeft, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SheetContent, SheetHeader, SheetBody, SheetFooter, SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { websiteProductService } from '@/services/websiteProductService';
import type { Product, WebsiteCategory } from '@/types/domain';

interface AddWebsiteProductSheetProps {
  categories: WebsiteCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function AddWebsiteProductSheet({
  categories, open, onOpenChange, onCreated,
}: AddWebsiteProductSheetProps) {
  // Step 1: Search & select a wholesale product
  // Step 2: Fill website-specific fields
  const [step, setStep] = useState<1 | 2>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Step 2 form fields
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [badge, setBadge] = useState<string>('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedProduct(null);
      setError(null);
    }
  }, [open]);

  // Search available products
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await websiteProductService.getAvailableProducts({
          search: searchQuery,
          limit: 20,
        });
        setSearchResults(result.data);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
    setSlug(slugify(product.name));
    setDisplayName(product.name);
    setShortDescription(product.ai_short_description || '');
    setRetailPrice(product.rate ? String((product.rate * 1.5).toFixed(2)) : '');
    setCompareAtPrice('');
    setCategoryId(null);
    setBadge('');
    setIsFeatured(false);
    setIsActive(true);
    setError(null);
    setStep(2);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!selectedProduct) return;
    if (!slug.trim()) { setError('Slug is required'); return; }
    if (!retailPrice || parseFloat(retailPrice) <= 0) { setError('Retail price is required'); return; }

    setCreating(true);
    setError(null);

    try {
      await websiteProductService.create({
        product_id: selectedProduct.id,
        slug: slug.trim(),
        display_name: displayName.trim() || null,
        short_description: shortDescription.trim() || null,
        retail_price: parseFloat(retailPrice),
        compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) : null,
        category_id: categoryId,
        badge: badge as 'new' | 'sale' | null || null,
        is_featured: isFeatured,
        is_active: isActive,
      });
      onCreated();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create website product');
    } finally {
      setCreating(false);
    }
  }, [selectedProduct, slug, displayName, shortDescription, retailPrice, compareAtPrice, categoryId, badge, isFeatured, isActive, onCreated, onOpenChange]);

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-[520px] w-full backdrop-blur-xl bg-card/95"
      aria-label="Add website product"
    >
      <SheetHeader className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3 pr-8">
          {step === 2 && (
            <button onClick={() => setStep(1)} className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {step === 1 ? 'Add to Website' : 'Configure Product'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === 1 ? 'Search your wholesale catalog' : `Setting up ${selectedProduct?.name}`}
            </p>
          </div>
        </div>
      </SheetHeader>

      <SheetBody className="px-5 py-4 overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }}>
              {/* Search input */}
              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, SKU, or brand..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  autoFocus
                />
                {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>

              {/* Search results */}
              <div className="space-y-1">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelectProduct(product)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="size-10 shrink-0 rounded object-cover bg-muted" loading="lazy" />
                    ) : (
                      <div className="size-10 shrink-0 rounded bg-muted flex items-center justify-center text-[9px] text-muted-foreground">IMG</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{product.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">{product.sku}</span>
                        {product.brand && <span className="text-xs text-primary/70">{product.brand}</span>}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(product.rate)}
                        </span>
                      </div>
                    </div>
                    <Plus size={14} className="text-muted-foreground/40" />
                  </button>
                ))}
                {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No available products found
                  </div>
                )}
                {searchQuery.length < 2 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Type at least 2 characters to search
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.15 }} className="space-y-4">
              {/* Slug */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">URL Slug *</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground/50">/products/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-md bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={selectedProduct?.name}
                  className="w-full px-3 py-1.5 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                />
              </div>

              {/* Short Description */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Short Description</label>
                <textarea
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  rows={2}
                  placeholder="Brief tagline for product cards..."
                  className="w-full px-3 py-1.5 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none"
                />
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Retail Price *</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
                    <input
                      type="number"
                      step="0.01"
                      value={retailPrice}
                      onChange={(e) => setRetailPrice(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 rounded-md bg-background border border-border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Compare At Price</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
                    <input
                      type="number"
                      step="0.01"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      placeholder="—"
                      className="w-full pl-7 pr-3 py-1.5 rounded-md bg-background border border-border text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
                <select
                  value={categoryId ?? ''}
                  onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-1.5 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                >
                  <option value="">Select category...</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Badge + Featured + Active */}
              <div className="grid grid-cols-3 gap-3">
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
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Featured</label>
                  <button
                    onClick={() => setIsFeatured(!isFeatured)}
                    className={cn('w-full px-2 py-1.5 rounded-md text-sm font-medium border transition-colors', isFeatured ? 'bg-primary/20 text-primary border-primary/30' : 'bg-background text-muted-foreground border-border')}
                  >
                    {isFeatured ? 'Yes' : 'No'}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Active</label>
                  <button
                    onClick={() => setIsActive(!isActive)}
                    className={cn('w-full px-2 py-1.5 rounded-md text-sm font-medium border transition-colors', isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-background text-muted-foreground border-border')}
                  >
                    {isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>

              {/* Base product info */}
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 mt-2">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Base Product</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">SKU</span>
                  <span className="text-foreground font-mono">{selectedProduct?.sku}</span>
                  <span className="text-muted-foreground">Brand</span>
                  <span className="text-foreground">{selectedProduct?.brand}</span>
                  <span className="text-muted-foreground">Wholesale</span>
                  <span className="text-foreground tabular-nums">
                    {selectedProduct?.rate ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(selectedProduct.rate) : '—'}
                  </span>
                  <span className="text-muted-foreground">Stock</span>
                  <span className={cn('tabular-nums font-medium', (selectedProduct?.stock_on_hand ?? 0) === 0 ? 'text-red-400' : 'text-emerald-400')}>
                    {selectedProduct?.stock_on_hand ?? 0}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetBody>

      <SheetFooter className="border-t border-border/60 px-5 py-3">
        <div className="flex items-center justify-between w-full">
          <div>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
          <div className="flex items-center gap-2">
            <SheetClose>
              <Button intent="outline" size="sm">Cancel</Button>
            </SheetClose>
            {step === 2 && (
              <Button intent="primary" size="sm" onPress={handleCreate} isDisabled={creating}>
                {creating && <Loader2 size={13} className="animate-spin mr-1" />}
                Add to Website
              </Button>
            )}
          </div>
        </div>
      </SheetFooter>
    </SheetContent>
  );
}
