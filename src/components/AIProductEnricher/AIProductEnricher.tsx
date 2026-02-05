import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { productService } from '../../services/productService';
import { aiService } from '../../services/aiService';
import type { Product } from '../../types/domain';
import { cn } from '@/lib/utils';

interface AIProductEnricherProps {
  companyId: string;
  onClose: () => void;
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

const AIProductEnricher: React.FC<AIProductEnricherProps> = ({ onClose, onComplete }) => {
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
    loadData();
  }, []);

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

      // Mark current as processing
      enrichResults[i].status = 'processing';
      setResults([...enrichResults]);

      const product = toProcess[i];

      try {
        // Call both AI endpoints in parallel
        const [description, category] = await Promise.all([
          aiService.enrichDescription({
            name: product.name,
            description: product.description || '',
            brand: product.brand,
            ean: product.ean || '',
          }),
          aiService.classifyCategory(product.name),
        ]);

        // Save to backend
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1a1f2a] rounded-xl border border-gray-700 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-brand-300" />
            <h2 className="text-base font-semibold text-white">AI Product Enrichment</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'configure' && (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3 text-center">
                  <div className="text-lg font-semibold text-white tabular-nums">{products.length}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total</div>
                </div>
                <div className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3 text-center">
                  <div className="text-lg font-semibold text-emerald-400 tabular-nums">{enrichedCount}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Enriched</div>
                </div>
                <div className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3 text-center">
                  <div className="text-lg font-semibold text-brand-300 tabular-nums">{toProcess.length}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Will Process</div>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] font-medium text-gray-400 block mb-1">Brand Filter</label>
                  <select
                    value={brandFilter}
                    onChange={(e) => setBrandFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-brand-300"
                  >
                    <option value="">All Brands</option>
                    {brands.map(b => (
                      <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[12px] font-medium text-gray-400 block mb-1">Max Products</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(Math.max(1, Math.min(100, parseInt(e.target.value) || 25)))}
                    className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-brand-300"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyUnenriched}
                    onChange={(e) => setOnlyUnenriched(e.target.checked)}
                    className="rounded border-gray-600 bg-[#0f1419] text-brand-300 focus:ring-brand-300/30"
                  />
                  <span className="text-sm text-gray-300">Only products without AI descriptions</span>
                </label>
              </div>

              <p className="text-[12px] text-gray-500">
                Each product will get an AI-generated description and category classification. Results are saved automatically.
              </p>
            </div>
          )}

          {step === 'processing' && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">
                    Processing {processed} / {results.length}
                  </span>
                  <span className="text-sm text-gray-500 tabular-nums">
                    {Math.round((processed / (results.length || 1)) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-[#0f1419] rounded-full border border-gray-700/60 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-300 to-[#4daeac] rounded-full transition-all duration-300"
                    style={{ width: `${(processed / (results.length || 1)) * 100}%` }}
                  />
                </div>
              </div>

              {/* Current item */}
              {results[processed] && processed < results.length && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin text-brand-300" />
                  <span className="truncate">{results[processed]?.name}</span>
                </div>
              )}

              {/* Scrolling results list */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {results.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2 py-1 text-[12px]">
                    {r.status === 'done' && <CheckCircle size={12} className="text-emerald-400 shrink-0" />}
                    {r.status === 'error' && <AlertTriangle size={12} className="text-red-400 shrink-0" />}
                    {r.status === 'processing' && <Loader2 size={12} className="text-brand-300 animate-spin shrink-0" />}
                    {r.status === 'pending' && <div className="w-3 h-3 rounded-full border border-gray-700 shrink-0" />}
                    <span className={cn('truncate', r.status === 'done' ? 'text-gray-300' : r.status === 'error' ? 'text-red-400' : 'text-gray-500')}>
                      {r.sku} — {r.name}
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
                <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3 text-center">
                  <div className="text-xl font-semibold text-emerald-400 tabular-nums">{successCount}</div>
                  <div className="text-[11px] text-emerald-400/70">Enriched</div>
                </div>
                {errorCount > 0 && (
                  <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-semibold text-red-400 tabular-nums">{errorCount}</div>
                    <div className="text-[11px] text-red-400/70">Failed</div>
                  </div>
                )}
              </div>

              {/* Sample results */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {results.filter(r => r.status === 'done').slice(0, 10).map(r => (
                  <div key={r.id} className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-gray-500">{r.sku}</span>
                      {r.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-300/10 text-brand-300 border border-brand-300/20">
                          {r.category}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] font-medium text-white mb-1">{r.name}</div>
                    {r.description && (
                      <div className="text-[12px] text-gray-400 line-clamp-2">{r.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          {step === 'configure' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                disabled={toProcess.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-300 to-[#4daeac] text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-brand-300/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles size={14} />
                Enrich {toProcess.length} Product{toProcess.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {step === 'processing' && (
            <button
              onClick={() => setCancelled(true)}
              className="px-4 py-2 text-sm text-red-400 border border-red-400/20 rounded-lg hover:bg-red-400/10 transition-colors"
            >
              Stop
            </button>
          )}
          {step === 'results' && (
            <button
              onClick={() => { onComplete?.(); onClose(); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-300 to-[#4daeac] text-white rounded-lg text-sm font-medium"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIProductEnricher;
