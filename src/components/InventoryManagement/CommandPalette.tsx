import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import {
  Search,
  Package2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { productService } from '../../services/productService';
import type { Product } from '../../types/domain';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProduct: (product: Product) => void;
}

const formatCurrency = (value?: number | null) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
};

const stockColor = (level: number) => {
  if (level === 0) return 'text-red-400';
  if (level <= 5) return 'text-amber-400';
  return 'text-emerald-400';
};

export function CommandPalette({ open, onOpenChange, onSelectProduct }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      // Small delay to allow animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const searchProducts = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await productService.list({
        search: searchQuery,
        limit: 12,
        offset: 0,
        status: 'active',
      });
      setResults(response.data || []);
    } catch (err) {
      console.error('Command palette search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => searchProducts(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchProducts]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const handleSelect = useCallback(
    (product: Product) => {
      onSelectProduct(product);
      onOpenChange(false);
    },
    [onSelectProduct, onOpenChange]
  );

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed left-1/2 top-[15%] z-[101] w-full max-w-lg -translate-x-1/2"
          >
            <CommandPrimitive
              className="overflow-hidden rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl"
              shouldFilter={false}
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
                {loading ? (
                  <Loader2 size={16} className="shrink-0 text-muted-foreground/50 animate-spin" />
                ) : (
                  <Search size={16} className="shrink-0 text-muted-foreground/50" />
                )}
                <CommandPrimitive.Input
                  ref={inputRef}
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search products by name, SKU, or EAN..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-muted/60 border border-border/40 text-[10px] text-muted-foreground/60 font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <CommandPrimitive.List className="max-h-[360px] overflow-y-auto p-1.5">
                {/* Empty state */}
                {!loading && query.trim() && results.length === 0 && (
                  <CommandPrimitive.Empty className="flex flex-col items-center gap-2 py-10 text-muted-foreground/50">
                    <Package2 size={24} />
                    <span className="text-sm">No products found</span>
                  </CommandPrimitive.Empty>
                )}

                {/* Initial hint */}
                {!query.trim() && (
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground/40">
                    <Search size={20} />
                    <span className="text-xs">Type to search across all products</span>
                  </div>
                )}

                {/* Product results */}
                {results.map((product, idx) => {
                  const cost = product.cost_price ?? 0;
                  const rate = product.rate ?? 0;
                  const margin = cost > 0 ? Math.round(((rate - cost) / cost) * 100) : null;

                  return (
                    <CommandPrimitive.Item
                      key={product.id}
                      value={`${product.name}-${product.sku}`}
                      onSelect={() => handleSelect(product)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                        'data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground',
                        'hover:bg-muted/50'
                      )}
                    >
                      {/* Image or placeholder */}
                      <div className="w-9 h-9 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center overflow-hidden shrink-0">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package2 size={14} className="text-muted-foreground/30" />
                        )}
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {product.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-mono text-muted-foreground/60">
                            {product.sku}
                          </span>
                          {product.brand && (
                            <span className="text-[11px] text-primary/60">{product.brand}</span>
                          )}
                        </div>
                      </div>

                      {/* Right side - price + stock */}
                      <div className="flex items-center gap-3 shrink-0">
                        {rate > 0 && (
                          <span className="text-xs font-medium text-foreground/70 tabular-nums">
                            {formatCurrency(rate)}
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-xs font-semibold tabular-nums min-w-[20px] text-right',
                            stockColor(product.stock_on_hand)
                          )}
                        >
                          {product.stock_on_hand}
                        </span>
                        <ArrowRight size={12} className="text-muted-foreground/30" />
                      </div>
                    </CommandPrimitive.Item>
                  );
                })}
              </CommandPrimitive.List>

              {/* Footer hint */}
              {results.length > 0 && (
                <div className="border-t border-border/30 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/30 font-mono">↑↓</kbd>
                      Navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/30 font-mono">↵</kbd>
                      Open
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/30 font-mono">esc</kbd>
                      Close
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                    {results.length} result{results.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </CommandPrimitive>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
