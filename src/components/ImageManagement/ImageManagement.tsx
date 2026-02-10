import { useState, useEffect, useCallback, useRef } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Images, HardDrive, Layers, LayoutGrid, List, Search,
  Upload, Sparkles, Trash2, Loader2, X, Download, Copy, Check,
  ImageOff, Eye, Save, Link, RefreshCw,
} from 'lucide-react';
import { imageService, type ImageFilters, type ImageStats } from '@/services/imageService';
import { productService } from '@/services/productService';
import type { ProductImage, Product } from '@/types/domain';
import ImageCard from './ImageCard';
import BatchImageUpload from './BatchImageUpload';

const PAGE_SIZE = 50;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Main Component ──────────────────────────────────────────

export default function ImageManagement() {
  usePageTitle('Image Management');

  const [images, setImages] = useState<ProductImage[]>([]);
  const [brands, setBrands] = useState<{ brand: string; image_count: number }[]>([]);
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // View
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    (localStorage.getItem('image-view-mode') as 'grid' | 'list') || 'grid',
  );

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Modals
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [detailImage, setDetailImage] = useState<ProductImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Data loading ──

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const filters: ImageFilters = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (brandFilter) filters.brand = brandFilter;
      if (search) filters.search = search;

      const result = await imageService.list(filters);
      setImages(result.data);
      setTotalCount(result.meta?.total ?? result.data.length);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, brandFilter, sortBy, sortOrder]);

  const loadMeta = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([imageService.getBrands(), imageService.getStats()]);
      setBrands(b);
      setStats(s);
    } catch (err) {
      console.error('Failed to load image metadata:', err);
    }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadImages(); }, [loadImages]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(0);
    }, 300);
  };

  // View mode persistence
  const setView = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('image-view-mode', mode);
  };

  // ── Selection ──

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === images.length) setSelected(new Set());
    else setSelected(new Set(images.map((i) => i.id)));
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} image${selected.size !== 1 ? 's' : ''}?`)) return;
    setDeleting(true);
    try {
      await imageService.bulkDelete(Array.from(selected));
      setSelected(new Set());
      loadImages();
      loadMeta();
    } catch (err) {
      console.error('Bulk delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSingle = async (id: number) => {
    if (!confirm('Delete this image?')) return;
    try {
      await imageService.delete(id);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      if (detailImage?.id === id) setDetailImage(null);
      loadImages();
      loadMeta();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const [refreshingSizes, setRefreshingSizes] = useState(false);
  const handleRefreshSizes = async () => {
    setRefreshingSizes(true);
    try {
      const result = await imageService.refreshSizes();
      if (result.updated > 0) {
        loadImages();
        loadMeta();
      }
      alert(`Updated ${result.updated} of ${result.total} images. ${result.errors} errors.`);
    } catch (err) {
      console.error('Refresh sizes failed:', err);
    } finally {
      setRefreshingSizes(false);
    }
  };

  const handleImageUpdate = async (id: number, data: Parameters<typeof imageService.update>[1]) => {
    try {
      const updated = await imageService.update(id, data);
      // Update in local state
      setImages((prev) => prev.map((img) => img.id === id ? { ...img, ...updated } : img));
      setDetailImage((prev) => prev && prev.id === id ? { ...prev, ...updated } : prev);
    } catch (err) {
      console.error('Update failed:', err);
      throw err;
    }
  };

  // ── Pagination ──
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  // ── Render ──

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Image Management"
        count={stats?.total_images}
        subtitle="images"
        actions={
          <>
            <Button intent="outline" size="sm" onPress={handleRefreshSizes} isDisabled={refreshingSizes}>
              <RefreshCw className={`size-4 mr-1.5 ${refreshingSizes ? 'animate-spin' : ''}`} /> {refreshingSizes ? 'Refreshing...' : 'Refresh Sizes'}
            </Button>
            <Button intent="outline" size="sm" onPress={() => setShowBatchUpload(true)}>
              <Sparkles className="size-4 mr-1.5" /> AI Batch Upload
            </Button>
          </>
        }
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-blue-500/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Images</p>
                <p className="text-2xl font-bold text-blue-400 tabular-nums">{stats.total_images.toLocaleString()}</p>
              </div>
              <Images className="size-5 text-blue-400" />
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Size</p>
                <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatFileSize(stats.total_size_bytes)}</p>
              </div>
              <HardDrive className="size-5 text-emerald-400" />
            </CardContent>
          </Card>
          <Card className="border-amber-500/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active Brands</p>
                <p className="text-2xl font-bold text-amber-400 tabular-nums">{stats.brand_count}</p>
              </div>
              <Layers className="size-5 text-amber-400" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search filename or SKU..."
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Brand filter */}
        <select
          value={brandFilter}
          onChange={(e) => { setBrandFilter(e.target.value); setPage(0); }}
          className="h-8 px-2 text-sm rounded-md border border-border bg-background text-foreground"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.brand} value={b.brand}>
              {b.brand} ({b.image_count})
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => {
            const [sb, so] = e.target.value.split(':');
            setSortBy(sb);
            setSortOrder(so as 'asc' | 'desc');
            setPage(0);
          }}
          className="h-8 px-2 text-sm rounded-md border border-border bg-background text-foreground"
        >
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="filename:asc">Name A-Z</option>
          <option value="filename:desc">Name Z-A</option>
          <option value="size_bytes:desc">Largest first</option>
          <option value="size_bytes:asc">Smallest first</option>
        </select>

        <div className="flex-1" />

        {/* Bulk delete */}
        {selected.size > 0 && (
          <Button intent="danger" size="sm" onPress={handleBulkDelete} isDisabled={deleting}>
            {deleting ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Trash2 className="size-3.5 mr-1" />}
            Delete {selected.size}
          </Button>
        )}

        {/* View toggle */}
        <div className="flex border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setView('grid')}
            className={`size-8 flex items-center justify-center transition-colors ${
              viewMode === 'grid' ? 'bg-teal-600 text-white' : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
            title="Grid view"
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={`size-8 flex items-center justify-center transition-colors border-l border-border ${
              viewMode === 'list' ? 'bg-teal-600 text-white' : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
            title="List view"
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {/* Select all */}
      {images.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={selected.size === images.length && images.length > 0}
            onChange={toggleSelectAll}
            className="rounded"
          />
          <span>
            {selected.size > 0 ? `${selected.size} of ${totalCount} selected` : `${totalCount} images`}
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" /> Loading images...
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Images className="size-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No images yet</p>
          <p className="text-xs mt-1">Upload images using the AI Batch Upload button above.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {images.map((img) => (
            <ImageCard
              key={img.id}
              image={img}
              selected={selected.has(img.id)}
              onSelect={() => toggleSelect(img.id)}
              onView={() => setDetailImage(img)}
              onDelete={() => handleDeleteSingle(img.id)}
              anySelected={selected.size > 0}
            />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="p-2 w-8">
                  <input type="checkbox" checked={selected.size === images.length && images.length > 0} onChange={toggleSelectAll} className="rounded" />
                </th>
                <th className="p-2 w-12"></th>
                <th className="p-2">Filename</th>
                <th className="p-2">Brand</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Size</th>
                <th className="p-2">AI Type</th>
                <th className="p-2">Date</th>
                <th className="p-2 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {images.map((img) => (
                <tr
                  key={img.id}
                  className={`border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors ${
                    selected.has(img.id) ? 'bg-teal-500/5' : ''
                  }`}
                  onClick={() => setDetailImage(img)}
                >
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(img.id)} onChange={() => toggleSelect(img.id)} className="rounded" />
                  </td>
                  <td className="p-2">
                    <div className="size-10 rounded bg-muted/30 overflow-hidden">
                      <img src={img.url} alt="" className="size-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  </td>
                  <td className="p-2 font-medium text-foreground truncate max-w-[200px]">{img.filename}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[10px]">{img.brand}</Badge></td>
                  <td className="p-2 text-muted-foreground">{img.matched_sku || '—'}</td>
                  <td className="p-2 text-muted-foreground tabular-nums">{formatFileSize(img.size_bytes)}</td>
                  <td className="p-2 text-muted-foreground">{img.ai_product_type || '—'}</td>
                  <td className="p-2 text-muted-foreground">{formatDate(img.created_at)}</td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDetailImage(img)} className="size-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Eye className="size-3.5" />
                      </button>
                      <button onClick={() => handleDeleteSingle(img.id)} className="size-7 flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{from}&ndash;{to} of {totalCount}</span>
          <div className="flex gap-1">
            <Button intent="outline" size="sm" isDisabled={page === 0} onPress={() => setPage((p) => p - 1)}>Previous</Button>
            <Button intent="outline" size="sm" isDisabled={to >= totalCount} onPress={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Batch Upload Modal */}
      {showBatchUpload && (
        <BatchImageUpload
          onClose={() => { setShowBatchUpload(false); loadImages(); loadMeta(); }}
        />
      )}

      {/* Image Detail Modal */}
      {detailImage && (
        <ImageDetailModal
          image={detailImage}
          onClose={() => setDetailImage(null)}
          onDelete={() => { handleDeleteSingle(detailImage.id); setDetailImage(null); }}
          onUpdate={(data) => handleImageUpdate(detailImage.id, data)}
        />
      )}
    </div>
  );
}

// ── Image Detail Modal ──────────────────────────────────────

interface ImageDetailModalProps {
  image: ProductImage;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: (data: { brand?: string; matched_sku?: string; product_id?: number | null; ai_product_type?: string; ai_color?: string }) => Promise<void>;
}

function ImageDetailModal({ image, onClose, onDelete, onUpdate }: ImageDetailModalProps) {
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [brand, setBrand] = useState(image.brand);
  const [matchedSku, setMatchedSku] = useState(image.matched_sku || '');
  const [aiProductType, setAiProductType] = useState(image.ai_product_type || '');
  const [aiColor, setAiColor] = useState(image.ai_color || '');

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [linkedProduct, setLinkedProduct] = useState<{ id: number; name: string; sku: string } | null>(
    image.product_id ? { id: image.product_id, name: '', sku: image.matched_sku || '' } : null,
  );
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleProductSearch = (value: string) => {
    setProductSearch(value);
    clearTimeout(searchTimerRef.current);
    if (value.length < 2) { setProductResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await productService.list({ search: value, limit: 8 });
        setProductResults(result.data || []);
      } catch { setProductResults([]); }
      finally { setSearching(false); }
    }, 300);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        brand,
        matched_sku: matchedSku || undefined,
        product_id: linkedProduct?.id ?? null,
        ai_product_type: aiProductType || undefined,
        ai_color: aiColor || undefined,
      });
      setEditing(false);
    } catch { /* parent logs */ }
    finally { setSaving(false); }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(image.url);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch { /* ignore */ }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const inputCls = 'h-8 px-2 text-sm rounded-md border border-border bg-muted/20 text-foreground w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground truncate pr-4">{image.filename}</h3>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-xs text-teal-400 hover:text-teal-300">
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Image preview */}
        <div className="p-4 flex justify-center bg-muted/10">
          <img
            src={image.url}
            alt={image.filename}
            className="max-h-[400px] max-w-full object-contain rounded"
          />
        </div>

        {/* Metadata */}
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {editing ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Brand</label>
                  <input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Matched SKU</label>
                  <input className={inputCls} value={matchedSku} onChange={(e) => setMatchedSku(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">AI Product Type</label>
                  <input className={inputCls} value={aiProductType} onChange={(e) => setAiProductType(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">AI Color</label>
                  <input className={inputCls} value={aiColor} onChange={(e) => setAiColor(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <Detail label="Brand" value={image.brand} />
                <Detail label="Original filename" value={image.original_filename} />
                <Detail label="Size" value={formatFileSize(image.size_bytes)} />
                <Detail label="Format" value={image.content_type} />
                {image.width && image.height && (
                  <Detail label="Dimensions" value={`${image.width} × ${image.height}`} />
                )}
                <Detail label="Uploaded" value={formatDate(image.created_at)} />
                {image.matched_sku && (
                  <Detail label="Matched SKU" value={image.matched_sku} highlight />
                )}
                {image.sku_confidence != null && (
                  <Detail label="SKU Confidence" value={`${Math.round(image.sku_confidence * 100)}%`} />
                )}
                {image.ai_product_type && (
                  <Detail label="AI Product Type" value={image.ai_product_type} />
                )}
                {image.ai_color && (
                  <Detail label="AI Color" value={image.ai_color} />
                )}
              </>
            )}
          </div>

          {/* Product link */}
          {editing && (
            <div className="pt-2 border-t border-border">
              <label className="text-xs text-muted-foreground block mb-1">
                <Link className="size-3 inline mr-1" />Linked Product
              </label>
              {linkedProduct && (
                <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-teal-500/10 border border-teal-500/20">
                  <span className="text-sm text-foreground flex-1">
                    {linkedProduct.sku && <span className="text-teal-400 font-medium mr-2">{linkedProduct.sku}</span>}
                    {linkedProduct.name}
                  </span>
                  <button onClick={() => setLinkedProduct(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="relative">
                <input
                  className={inputCls}
                  placeholder="Search products by name or SKU..."
                  value={productSearch}
                  onChange={(e) => handleProductSearch(e.target.value)}
                />
                {searching && <Loader2 className="size-3.5 animate-spin absolute right-2 top-2 text-muted-foreground" />}
              </div>
              {productResults.length > 0 && (
                <div className="mt-1 border border-border rounded-md bg-card max-h-[200px] overflow-y-auto">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/30 border-b border-border/50 last:border-b-0 flex items-center gap-2"
                      onClick={() => {
                        setLinkedProduct({ id: p.id, name: p.name, sku: p.sku });
                        setMatchedSku(p.sku);
                        setProductSearch('');
                        setProductResults([]);
                      }}
                    >
                      {p.image_url && (
                        <img src={p.image_url} alt="" className="size-8 rounded object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku} - {p.brand}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!editing && image.product_id && (
            <div>
              <p className="text-xs text-muted-foreground">Linked Product ID</p>
              <p className="text-sm font-medium text-teal-400">{image.product_id}</p>
            </div>
          )}

          {/* URL */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={image.url}
                className="flex-1 h-8 px-2 text-xs rounded-md border border-border bg-muted/30 text-muted-foreground"
              />
              <Button intent="outline" size="sm" onPress={handleCopy}>
                {copying ? <Check className="size-3.5 mr-1 text-emerald-400" /> : <Copy className="size-3.5 mr-1" />}
                {copying ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex gap-2">
            <Button intent="outline" size="sm" onPress={handleDownload}>
              <Download className="size-3.5 mr-1" /> Download
            </Button>
            {editing && (
              <Button intent="primary" size="sm" onPress={handleSave} isDisabled={saving}>
                <Save className="size-3.5 mr-1" /> {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
          <Button intent="danger" size="sm" onPress={onDelete}>
            <Trash2 className="size-3.5 mr-1" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${highlight ? 'text-teal-400' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
