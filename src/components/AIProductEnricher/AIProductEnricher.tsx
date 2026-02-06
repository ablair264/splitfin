import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { productService } from '../../services/productService';
import { aiService } from '../../services/aiService';
import type { Product } from '../../types/domain';
import { cn } from '@/lib/utils';
import {
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface AIProductEnricherProps {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface EnrichmentResult {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

const AIProductEnricher: React.FC<AIProductEnricherProps> = ({ open, onOpenChange, onComplete }) => {
  const [step, setStep] = useState<'configure' | 'processing' | 'results'>('configure');
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [brandFilter, setBrandFilter] = useState('');
  const [maxProducts, setMaxProducts] = useState(25);
  const [onlyUnenriched, setOnlyUnenriched] = useState(true);
  const [results, setResults] = useState<EnrichmentResult[]>([]);
  const [processed, setProcessed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const loadData = async () => {
    try {
      const [productsRes, brandsData] = await Promise.all([
        productService.list({ limit: 500, status: 'active' }),
        productService.getBrands(),
      ]);
      setProducts(productsRes.data || []);
      setBrands(brandsData);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const filteredProducts = products.filter(p => {
    if (brandFilter && p.brand !== brandFilter) return false;
    if (onlyUnenriched && p.ai_description && p.ai_description.length > 0) return false;
    return true;
  });

  const toProcess = filteredProducts.slice(0, maxProducts);
  const enrichedCount = products.filter(p => p.ai_description && p.ai_description.length > 0).length;

  const handleStart = async () => {
    setStep('processing');
    setError(null);
    setCancelled(false);
    setProcessed(0);

    const enrichResults: EnrichmentResult[] = toProcess.map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: null,
      category: null,
      status: 'pending' as const,
    }));
    setResults(enrichResults);

    for (let i = 0; i < enrichResults.length; i++) {
      if (cancelled) break;

      enrichResults[i].status = 'processing';
      setResults([...enrichResults]);

      const product = toProcess[i];

      try {
        const [description, category] = await Promise.all([
          aiService.enrichDescription({
            name: product.name,
            description: product.description || '',
            brand: product.brand,
            ean: product.ean || '',
          }),
          aiService.classifyCategory(product.name),
        ]);

        const updatePayload: Partial<Product> = {};
        if (description) updatePayload.ai_description = description;
        if (category) updatePayload.category_name = category;

        await productService.update(product.id, updatePayload);

        enrichResults[i].description = description;
        enrichResults[i].category = category;
        enrichResults[i].status = 'done';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed';
        enrichResults[i].status = 'error';
        enrichResults[i].error = msg;
      }

      setProcessed(i + 1);
      setResults([...enrichResults]);
    }

    setStep('results');
  };

  const successCount = results.filter(r => r.status === 'done').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-lg w-full"
      aria-label="AI Product Enrichment"
    >
      {/* Header */}
      <SheetHeader className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5 pr-6">
          <Sparkles size={18} className="text-brand-300" />
          <h2 className="text-base font-semibold text-foreground">AI Product Enrichment</h2>
        </div>
      </SheetHeader>

      {/* Body */}
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
                <div className="text-lg font-semibold text-success tabular-nums">{enrichedCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Enriched</div>
              </div>
              <div className="bg-background rounded-lg border border-border p-3 text-center">
                <div className="text-lg font-semibold text-brand-300 tabular-nums">{toProcess.length}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Will Process</div>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Brand Filter</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All Brands</option>
                  {brands.map(b => (
                    <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Max Products</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxProducts}
                  onChange={(e) => setMaxProducts(Math.max(1, Math.min(100, parseInt(e.target.value) || 25)))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyUnenriched}
                  onChange={(e) => setOnlyUnenriched(e.target.checked)}
                  className="rounded border-border bg-background text-primary focus:ring-primary/30"
                />
                <span className="text-sm text-foreground/80">Only products without AI descriptions</span>
              </label>
            </div>

            <p className="text-[12px] text-muted-foreground">
              Each product will get an AI-generated description and category classification. Results are saved automatically.
            </p>
          </div>
        )}

        {step === 'processing' && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground/80">
                  Processing {processed} / {results.length}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round((processed / (results.length || 1)) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-background rounded-full border border-border overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${(processed / (results.length || 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* Current item */}
            {results[processed] && processed < results.length && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin text-brand-300" />
                <span className="truncate">{results[processed]?.name}</span>
              </div>
            )}

            {/* Scrolling results list */}
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {results.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-1 text-[12px]">
                  {r.status === 'done' && <CheckCircle size={12} className="text-success shrink-0" />}
                  {r.status === 'error' && <AlertTriangle size={12} className="text-destructive shrink-0" />}
                  {r.status === 'processing' && <Loader2 size={12} className="text-brand-300 animate-spin shrink-0" />}
                  {r.status === 'pending' && <div className="w-3 h-3 rounded-full border border-border shrink-0" />}
                  <span className={cn('truncate', r.status === 'done' ? 'text-foreground/80' : r.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                    {r.sku} &mdash; {r.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-center">
                <div className="text-xl font-semibold text-success tabular-nums">{successCount}</div>
                <div className="text-[11px] text-success/70">Enriched</div>
              </div>
              {errorCount > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
                  <div className="text-xl font-semibold text-destructive tabular-nums">{errorCount}</div>
                  <div className="text-[11px] text-destructive/70">Failed</div>
                </div>
              )}
            </div>

            {/* Sample results */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {results.filter(r => r.status === 'done').slice(0, 10).map(r => (
                <div key={r.id} className="bg-background rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-muted-foreground">{r.sku}</span>
                    {r.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-300/10 text-brand-300 border border-brand-300/20">
                        {r.category}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-medium text-foreground mb-1">{r.name}</div>
                  {r.description && (
                    <div className="text-[12px] text-muted-foreground line-clamp-2">{r.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetBody>

      {/* Footer */}
      <SheetFooter className="border-t border-border px-5 py-3">
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
                isDisabled={toProcess.length === 0}
              >
                <Sparkles size={14} className="mr-1" />
                Enrich {toProcess.length} Product{toProcess.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {step === 'processing' && (
            <Button
              intent="danger"
              size="sm"
              onPress={() => setCancelled(true)}
            >
              Stop
            </Button>
          )}
          {step === 'results' && (
            <Button
              intent="primary"
              size="sm"
              onPress={() => { onComplete?.(); onOpenChange(false); }}
            >
              Done
            </Button>
          )}
        </div>
      </SheetFooter>
    </SheetContent>
  );
};

export default AIProductEnricher;
