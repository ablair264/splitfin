import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Copy, Check, Loader2, Trash2, Pencil, X, AlertTriangle,
  ImagePlus, Upload, Eye, EyeOff, Star, GripVertical, Tag, Plus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  SheetContent, SheetHeader, SheetBody, SheetFooter, SheetClose,
} from '@/components/ui/sheet';
import {
  Editable, EditableArea, EditablePreview, EditableInput,
} from '@/components/ui/editable';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { websiteProductService } from '@/services/websiteProductService';
import type { WebsiteProduct, WebsiteCategory, WebsiteTag } from '@/types/domain';

interface WebsiteProductDetailSheetProps {
  product: WebsiteProduct | null;
  categories: WebsiteCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const formatCurrency = (value?: number | null) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
};

function DetailRow({ label, editing, children }: { label: string; editing: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between px-3 py-2 transition-colors', editing && 'bg-primary/[0.02]')}>
      <span className="text-xs text-muted-foreground/60 w-28 shrink-0">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}

export function WebsiteProductDetailSheet({
  product, categories, open, onOpenChange, onUpdated,
}: WebsiteProductDetailSheetProps) {
  const [staleProduct, setStaleProduct] = useState<WebsiteProduct | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [productTags, setProductTags] = useState<WebsiteTag[]>([]);
  const [allTags, setAllTags] = useState<WebsiteTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (product) setStaleProduct(product);
  }, [product]);

  const p = product || staleProduct;
  const hasDirtyFields = Object.keys(dirtyFields).length > 0;

  const handleFieldSubmit = useCallback((field: string, value: string) => {
    if (!p) return;
    const currentVal = String((p as unknown as Record<string, unknown>)[field] ?? '');
    if (value === currentVal) {
      setDirtyFields((prev) => { const next = { ...prev }; delete next[field]; return next; });
      return;
    }
    setDirtyFields((prev) => ({ ...prev, [field]: value }));
  }, [p]);

  const handleNumericFieldSubmit = useCallback((field: string, value: string) => {
    if (!p) return;
    const numVal = parseFloat(value) || 0;
    const currentVal = (p as unknown as Record<string, unknown>)[field];
    if (numVal === Number(currentVal ?? 0)) {
      setDirtyFields((prev) => { const next = { ...prev }; delete next[field]; return next; });
      return;
    }
    setDirtyFields((prev) => ({ ...prev, [field]: numVal }));
  }, [p]);

  const handleToggle = useCallback((field: string, value: boolean) => {
    setDirtyFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSelectChange = useCallback((field: string, value: string | number | null) => {
    setDirtyFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!p || !hasDirtyFields) return;
    setSaving(true);
    setSaveError(null);
    try {
      await websiteProductService.update(p.id, dirtyFields as Partial<WebsiteProduct>);
      setDirtyFields({});
      setIsEditing(false);
      onUpdated();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }, [p, dirtyFields, hasDirtyFields, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (!p) return;
    try {
      await websiteProductService.remove(p.id);
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      console.error('Error deleting website product:', err);
    }
  }, [p, onOpenChange, onUpdated]);

  const handleCancelEdit = useCallback(() => {
    setDirtyFields({});
    setIsEditing(false);
    setSaveError(null);
  }, []);

  const copySlug = useCallback(async () => {
    if (!p) return;
    await navigator.clipboard.writeText(p.slug);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 1500);
  }, [p]);

  // Load tags when product changes
  useEffect(() => {
    if (product?.id) {
      setTagsLoading(true);
      Promise.all([
        websiteProductService.getProductTags(product.id),
        websiteProductService.getTags(),
      ]).then(([pTags, aTags]) => {
        setProductTags(pTags);
        setAllTags(aTags);
      }).catch((err) => console.error('Failed to load tags:', err))
        .finally(() => setTagsLoading(false));
    } else {
      setProductTags([]);
    }
  }, [product?.id]);

  // Close tag dropdown on outside click
  useEffect(() => {
    if (!tagDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
        setNewTagName('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tagDropdownOpen]);

  useEffect(() => {
    setDirtyFields({});
    setSaveError(null);
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setImageError(null);
    setTagDropdownOpen(false);
    setNewTagName('');
  }, [product?.id]);

  const handleAddTag = useCallback(async (tag: WebsiteTag) => {
    if (!p) return;
    const newTagIds = [...productTags.map((t) => t.id), tag.id];
    try {
      const updated = await websiteProductService.setProductTags(p.id, newTagIds);
      setProductTags(updated);
      setTagDropdownOpen(false);
      setNewTagName('');
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  }, [p, productTags]);

  const handleRemoveTag = useCallback(async (tagId: number) => {
    if (!p) return;
    const newTagIds = productTags.filter((t) => t.id !== tagId).map((t) => t.id);
    try {
      const updated = await websiteProductService.setProductTags(p.id, newTagIds);
      setProductTags(updated);
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  }, [p, productTags]);

  const handleCreateTag = useCallback(async () => {
    if (!p || !newTagName.trim()) return;
    try {
      const tag = await websiteProductService.createTag(newTagName.trim());
      setAllTags((prev) => [...prev, tag]);
      const newTagIds = [...productTags.map((t) => t.id), tag.id];
      const updated = await websiteProductService.setProductTags(p.id, newTagIds);
      setProductTags(updated);
      setNewTagName('');
      setTagDropdownOpen(false);
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
  }, [p, productTags, newTagName]);

  const availableTags = allTags.filter(
    (t) => !productTags.some((pt) => pt.id === t.id) &&
      (!newTagName || t.name.toLowerCase().includes(newTagName.toLowerCase()))
  );

  const handleImageUpload = useCallback(async (file: File) => {
    if (!p) return;
    if (!file.type.startsWith('image/')) { setImageError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setImageError('Image must be under 5MB'); return; }

    setImageUploading(true);
    setImageError(null);
    try {
      await websiteProductService.uploadImage(p.id, file);
      onUpdated();
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setImageUploading(false);
    }
  }, [p, onUpdated]);

  const handleImageDelete = useCallback(async (imageId: number) => {
    if (!p) return;
    try {
      await websiteProductService.deleteImage(p.id, imageId);
      onUpdated();
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Failed to remove image');
    }
  }, [p, onUpdated]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = '';
  }, [handleImageUpload]);

  const pk = p?.id ?? 0;
  const images = p?.images || [];
  const primaryImage = images.find((img) => img.is_primary) || images[0];
  const effectiveBadge = dirtyFields.badge !== undefined ? dirtyFields.badge as string | null : p?.badge;
  const effectiveIsActive = dirtyFields.is_active !== undefined ? dirtyFields.is_active as boolean : p?.is_active;
  const effectiveIsFeatured = dirtyFields.is_featured !== undefined ? dirtyFields.is_featured as boolean : p?.is_featured;
  const effectiveCategoryId = dirtyFields.category_id !== undefined ? dirtyFields.category_id as number | null : p?.category_id;

  return (
    <>
      <SheetContent
        isOpen={open}
        onOpenChange={onOpenChange}
        side="right"
        isFloat={false}
        className="sm:max-w-[580px] w-full backdrop-blur-xl bg-card/95"
        aria-label="Website product details"
      >
        {p && (
          <>
            <SheetHeader className="border-b border-border/60 px-5 py-4">
              <div className="flex gap-4 pr-8">
                {/* Primary image */}
                <div className="shrink-0">
                  {primaryImage?.image_url ? (
                    <img src={primaryImage.image_url} alt={p.display_name || p.base_name || ''} className="w-20 h-20 object-contain rounded-xl border border-border bg-background" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-dashed border-border/60 bg-muted/30 flex items-center justify-center">
                      <ImagePlus size={18} className="text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-foreground leading-tight mb-2 pr-4">
                    {p.display_name || p.base_name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={copySlug} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border/50 text-[11px] font-mono text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all" title="Copy slug">
                      {copiedSlug ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                      /{p.slug}
                    </button>
                    {p.brand && (
                      <span className="px-2 py-0.5 rounded-md bg-primary/8 border border-primary/15 text-[11px] font-medium text-primary">{p.brand}</span>
                    )}
                    {p.sku && (
                      <span className="px-2 py-0.5 rounded-md bg-muted/50 border border-border/50 text-[11px] font-mono text-muted-foreground">{p.sku}</span>
                    )}
                    <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-medium border', p.is_active ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15' : 'bg-muted text-muted-foreground border-border')}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <SheetBody className="px-5 py-4 space-y-4 overflow-y-auto">
              {/* Image Gallery */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Images</h3>
                <div className="flex gap-2 flex-wrap">
                  {images.map((img) => (
                    <div key={img.id} className="relative group">
                      <img src={img.image_url} alt={img.alt_text || ''} className="w-16 h-16 object-cover rounded-lg border border-border" />
                      {img.is_primary && (
                        <Star size={10} className="absolute top-1 left-1 text-amber-400 fill-amber-400" />
                      )}
                      {isEditing && (
                        <button onClick={() => handleImageDelete(img.id)} className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Remove image">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                  {isEditing && (
                    <>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-16 h-16 rounded-lg border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center gap-0.5 hover:border-primary/30 hover:bg-primary/5 transition-all"
                      >
                        {imageUploading ? (
                          <Loader2 size={14} className="text-primary animate-spin" />
                        ) : (
                          <Upload size={14} className="text-muted-foreground/40" />
                        )}
                      </button>
                    </>
                  )}
                </div>
                {imageError && <p className="text-[10px] text-destructive mt-1">{imageError}</p>}
              </motion.div>

              {/* Product Details */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-border/40 divide-y divide-border/30">
                <DetailRow label="Display Name" editing={isEditing}>
                  {isEditing ? (
                    <Editable key={`dn-${pk}`} defaultValue={p.display_name || ''} placeholder={p.base_name || '—'} onSubmit={(val) => handleFieldSubmit('display_name', val)}>
                      <EditableArea><EditablePreview className="text-sm text-foreground py-0" /><EditableInput className="text-sm px-1" /></EditableArea>
                    </Editable>
                  ) : (
                    <span className="text-sm text-foreground">{p.display_name || <span className="text-muted-foreground">{p.base_name}</span>}</span>
                  )}
                </DetailRow>

                <DetailRow label="Slug" editing={isEditing}>
                  {isEditing ? (
                    <Editable key={`slug-${pk}`} defaultValue={p.slug} onSubmit={(val) => handleFieldSubmit('slug', val)}>
                      <EditableArea><EditablePreview className="text-sm text-foreground py-0 font-mono" /><EditableInput className="text-sm font-mono px-1" /></EditableArea>
                    </Editable>
                  ) : (
                    <span className="text-sm text-foreground font-mono">{p.slug}</span>
                  )}
                </DetailRow>

                <DetailRow label="Category" editing={isEditing}>
                  {isEditing ? (
                    <select
                      value={effectiveCategoryId ?? ''}
                      onChange={(e) => handleSelectChange('category_id', e.target.value ? Number(e.target.value) : null)}
                      className="text-sm bg-transparent border border-border/50 rounded px-2 py-0.5 text-foreground"
                    >
                      <option value="">None</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm text-foreground">{p.category_name || '—'}</span>
                  )}
                </DetailRow>

                <DetailRow label="Badge" editing={isEditing}>
                  {isEditing ? (
                    <select
                      value={effectiveBadge ?? ''}
                      onChange={(e) => handleSelectChange('badge', e.target.value || null)}
                      className="text-sm bg-transparent border border-border/50 rounded px-2 py-0.5 text-foreground"
                    >
                      <option value="">None</option>
                      <option value="new">New</option>
                      <option value="sale">Sale</option>
                    </select>
                  ) : (
                    <span className="text-sm text-foreground">{p.badge || '—'}</span>
                  )}
                </DetailRow>

                <DetailRow label="Featured" editing={isEditing}>
                  {isEditing ? (
                    <button
                      onClick={() => handleToggle('is_featured', !effectiveIsFeatured)}
                      className={cn('px-2 py-0.5 rounded text-xs font-medium border transition-colors', effectiveIsFeatured ? 'bg-primary/20 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border')}
                    >
                      {effectiveIsFeatured ? 'Yes' : 'No'}
                    </button>
                  ) : (
                    <span className="text-sm text-foreground">{p.is_featured ? 'Yes' : 'No'}</span>
                  )}
                </DetailRow>

                <DetailRow label="Active" editing={isEditing}>
                  {isEditing ? (
                    <button
                      onClick={() => handleToggle('is_active', !effectiveIsActive)}
                      className={cn('px-2 py-0.5 rounded text-xs font-medium border transition-colors', effectiveIsActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border')}
                    >
                      {effectiveIsActive ? 'Active' : 'Inactive'}
                    </button>
                  ) : (
                    <span className="text-sm text-foreground">{p.is_active ? 'Active' : 'Inactive'}</span>
                  )}
                </DetailRow>
              </motion.div>

              {/* Pricing */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl border border-border/40 divide-y divide-border/30">
                <DetailRow label="Retail Price" editing={isEditing}>
                  {isEditing ? (
                    <Editable key={`rp-${pk}`} defaultValue={String(p.retail_price ?? '')} onSubmit={(val) => handleNumericFieldSubmit('retail_price', val)}>
                      <EditableArea><EditablePreview className="text-sm font-semibold text-foreground tabular-nums py-0" /><EditableInput className="text-sm font-semibold px-1 w-20 text-right" type="number" /></EditableArea>
                    </Editable>
                  ) : (
                    <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(p.retail_price)}</span>
                  )}
                </DetailRow>
                <DetailRow label="Compare At" editing={isEditing}>
                  {isEditing ? (
                    <Editable key={`cap-${pk}`} defaultValue={String(p.compare_at_price ?? '')} placeholder="—" onSubmit={(val) => handleNumericFieldSubmit('compare_at_price', val)}>
                      <EditableArea><EditablePreview className="text-sm text-foreground/70 tabular-nums py-0" /><EditableInput className="text-sm px-1 w-20 text-right" type="number" /></EditableArea>
                    </Editable>
                  ) : (
                    <span className="text-sm text-foreground/70 tabular-nums">{formatCurrency(p.compare_at_price)}</span>
                  )}
                </DetailRow>
                <DetailRow label="Wholesale" editing={false}>
                  <span className="text-sm text-muted-foreground tabular-nums">{formatCurrency(p.wholesale_price)}</span>
                </DetailRow>
                <DetailRow label="Stock" editing={false}>
                  <span className={cn('text-sm font-semibold tabular-nums',
                    (p.stock_on_hand ?? 0) === 0 ? 'text-red-400' : (p.stock_on_hand ?? 0) <= 5 ? 'text-amber-400' : 'text-emerald-400'
                  )}>
                    {p.stock_on_hand ?? 0}
                  </span>
                </DetailRow>
              </motion.div>

              {/* Description */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Short Description</h3>
                {isEditing ? (
                  <Editable key={`sd-${pk}`} defaultValue={p.short_description || ''} placeholder="Add a short description..." onSubmit={(val) => handleFieldSubmit('short_description', val)}>
                    <EditableArea><EditablePreview className="text-sm text-foreground/70 leading-relaxed py-0.5" /><EditableInput asChild className="text-sm leading-relaxed min-h-[40px] px-3 py-2 rounded-lg"><textarea rows={2} /></EditableInput></EditableArea>
                  </Editable>
                ) : (
                  <p className="text-sm text-foreground/70 leading-relaxed">{p.short_description || '—'}</p>
                )}
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Full Description</h3>
                {isEditing ? (
                  <Editable key={`ld-${pk}`} defaultValue={p.long_description || ''} placeholder="Add a full description..." onSubmit={(val) => handleFieldSubmit('long_description', val)}>
                    <EditableArea><EditablePreview className="text-sm text-foreground/70 leading-relaxed py-0.5" /><EditableInput asChild className="text-sm leading-relaxed min-h-[80px] px-3 py-2 rounded-lg"><textarea rows={4} /></EditableInput></EditableArea>
                  </Editable>
                ) : (
                  <p className="text-sm text-foreground/70 leading-relaxed">{p.long_description || '—'}</p>
                )}
              </motion.div>

              {/* Features */}
              {(p.features && p.features.length > 0) && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Features</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {p.features.map((feature, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground/70">{feature}</span>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Tags */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
                <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Tags</h3>
                {tagsLoading ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {productTags.map((tag) => (
                      <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
                        <Tag size={10} />
                        {tag.name}
                        {isEditing && (
                          <button onClick={() => handleRemoveTag(tag.id)} className="ml-0.5 hover:text-destructive transition-colors">
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {productTags.length === 0 && !isEditing && (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                    {isEditing && (
                      <div className="relative" ref={tagDropdownRef}>
                        <button
                          onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-border/60 text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all"
                        >
                          <Plus size={10} /> Add tag
                        </button>
                        {tagDropdownOpen && (
                          <div className="absolute top-full left-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                            <div className="p-2 border-b border-border/40">
                              <input
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && newTagName.trim()) {
                                    const existing = availableTags.find((t) => t.name.toLowerCase() === newTagName.trim().toLowerCase());
                                    if (existing) handleAddTag(existing);
                                    else handleCreateTag();
                                  }
                                }}
                                placeholder="Search or create..."
                                className="w-full px-2 py-1 bg-background border border-border/50 rounded text-xs text-foreground focus:outline-none focus:border-primary"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-32 overflow-y-auto">
                              {availableTags.slice(0, 10).map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => handleAddTag(tag)}
                                  className="w-full text-left px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted/50 transition-colors"
                                >
                                  {tag.name}
                                </button>
                              ))}
                              {newTagName.trim() && !allTags.some((t) => t.name.toLowerCase() === newTagName.trim().toLowerCase()) && (
                                <button
                                  onClick={handleCreateTag}
                                  className="w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-primary/5 transition-colors border-t border-border/30"
                                >
                                  Create &ldquo;{newTagName.trim()}&rdquo;
                                </button>
                              )}
                              {availableTags.length === 0 && !newTagName.trim() && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">No more tags available</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

              {/* SEO */}
              {isEditing && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="rounded-xl border border-border/40 divide-y divide-border/30">
                  <DetailRow label="Meta Title" editing>
                    <Editable key={`mt-${pk}`} defaultValue={p.meta_title || ''} placeholder="SEO title..." onSubmit={(val) => handleFieldSubmit('meta_title', val)}>
                      <EditableArea><EditablePreview className="text-sm text-foreground py-0" /><EditableInput className="text-sm px-1" /></EditableArea>
                    </Editable>
                  </DetailRow>
                  <DetailRow label="Meta Desc" editing>
                    <Editable key={`md-${pk}`} defaultValue={p.meta_description || ''} placeholder="SEO description..." onSubmit={(val) => handleFieldSubmit('meta_description', val)}>
                      <EditableArea><EditablePreview className="text-sm text-foreground py-0" /><EditableInput className="text-sm px-1" /></EditableArea>
                    </Editable>
                  </DetailRow>
                </motion.div>
              )}
            </SheetBody>

            <SheetFooter className="border-t border-border/60 px-5 py-3">
              <div className="flex items-center justify-between w-full">
                <button onClick={() => setShowDeleteConfirm(true)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-destructive transition-colors">
                  <Trash2 size={13} /> Remove
                </button>
                <div className="flex items-center gap-2">
                  {saveError && <span className="text-xs text-destructive mr-2">{saveError}</span>}
                  {isEditing ? (
                    <>
                      <Button intent="outline" size="sm" onPress={handleCancelEdit}><X size={13} className="mr-1" />Cancel</Button>
                      {hasDirtyFields && (
                        <Button intent="primary" size="sm" onPress={handleSave} isDisabled={saving}>
                          {saving && <Loader2 size={13} className="animate-spin mr-1" />}Save Changes
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <SheetClose><Button intent="outline" size="sm">Close</Button></SheetClose>
                      <Button intent="primary" size="sm" onPress={() => setIsEditing(true)}><Pencil size={13} className="mr-1" />Edit</Button>
                    </>
                  )}
                </div>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>

      <AnimatePresence>
        {showDeleteConfirm && p && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Remove from website</h3>
                  <p className="text-xs text-muted-foreground">This won't delete the wholesale product</p>
                </div>
              </div>
              <p className="text-sm text-foreground/80 mb-4">
                Remove <span className="font-semibold">{p.display_name || p.base_name}</span> from the Pop Home website?
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">Cancel</button>
                <button onClick={handleDelete} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-destructive text-white hover:bg-destructive/90 transition-all">Remove</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
