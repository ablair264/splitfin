import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Package,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Loader2,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ImagePlus,
  TrendingUp,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import {
  Editable,
  EditableArea,
  EditablePreview,
  EditableInput,
} from '@/components/ui/editable';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { productService } from '../../services/productService';
import type { Product } from '../../types/domain';

const getProductField = (product: Product, field: string): unknown => {
  return (product as unknown as Record<string, unknown>)[field];
};

interface ProductDetailSheetProps {
  product: Product | null;
  brands: { brand: string; count: number }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const calculateMargin = (rate: number | null | undefined, cost: number | null | undefined) => {
  if (!rate || !cost || cost === 0) return null;
  return ((rate - cost) / cost) * 100;
};

const formatCurrency = (value?: number | null) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
};

// Visual margin indicator component
function MarginGauge({ margin }: { margin: number | null }) {
  const pct = margin ? Math.min(Math.max(margin, 0), 100) : 0;
  const color = !margin
    ? 'text-muted-foreground'
    : margin >= 40
      ? 'text-emerald-400'
      : margin >= 20
        ? 'text-primary'
        : margin >= 0
          ? 'text-amber-400'
          : 'text-red-400';
  const barColor = !margin
    ? 'bg-muted'
    : margin >= 40
      ? 'bg-emerald-500'
      : margin >= 20
        ? 'bg-primary'
        : margin >= 0
          ? 'bg-amber-500'
          : 'bg-red-500';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn('text-2xl font-bold tabular-nums', color)}>
        {margin !== null ? `${Math.round(margin)}%` : '—'}
      </span>
      <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Margin</span>
    </div>
  );
}

// Delete confirmation modal
function DeleteConfirmation({
  productName,
  productSku,
  onConfirm,
  onCancel,
}: {
  productName: string;
  productSku: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const isConfirmed = confirmText.toLowerCase() === productSku.toLowerCase();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Delete product</h3>
            <p className="text-xs text-muted-foreground">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-foreground/80 mb-4">
          To confirm, type <span className="font-mono font-semibold text-foreground">{productSku}</span> below:
        </p>

        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={productSku}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive/50 mb-4"
          autoFocus
        />

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmed}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
              isConfirmed
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            Delete permanently
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}


export function ProductDetailSheet({
  product,
  brands,
  open,
  onOpenChange,
  onUpdated,
}: ProductDetailSheetProps) {
  const [staleProduct, setStaleProduct] = useState<Product | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedSku, setCopiedSku] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  useEffect(() => {
    if (product) setStaleProduct(product);
  }, [product]);

  const p = product || staleProduct;

  const hasDirtyFields = Object.keys(dirtyFields).length > 0;

  const handleFieldSubmit = useCallback((field: string, value: string) => {
    if (!p) return;
    const currentVal = String(getProductField(p, field) ?? '');
    if (value === currentVal) {
      setDirtyFields((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return;
    }
    setDirtyFields((prev) => ({ ...prev, [field]: value }));
  }, [p]);

  const handleNumericFieldSubmit = useCallback((field: string, value: string) => {
    if (!p) return;
    const numVal = parseFloat(value) || 0;
    const currentVal = getProductField(p, field);
    if (numVal === Number(currentVal ?? 0)) {
      setDirtyFields((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return;
    }
    setDirtyFields((prev) => ({ ...prev, [field]: numVal }));
  }, [p]);

  const handleSave = useCallback(async () => {
    if (!p || !hasDirtyFields) return;
    setSaving(true);
    setSaveError(null);
    try {
      await productService.update(p.id, dirtyFields as Partial<Product>);
      setDirtyFields({});
      setIsEditing(false);
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save changes';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [p, dirtyFields, hasDirtyFields, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (!p) return;
    try {
      await productService.update(p.id, { status: 'inactive' });
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  }, [p, onOpenChange, onUpdated]);

  const handleCancelEdit = useCallback(() => {
    setDirtyFields({});
    setIsEditing(false);
    setSaveError(null);
  }, []);

  const copySku = useCallback(async () => {
    if (!p) return;
    await navigator.clipboard.writeText(p.sku);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 1500);
  }, [p]);

  useEffect(() => {
    setDirtyFields({});
    setSaveError(null);
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setDetailsExpanded(false);
  }, [product?.id]);

  const effectiveRate = useMemo(() => {
    if (!p) return null;
    return dirtyFields.rate !== undefined ? Number(dirtyFields.rate) : p.rate;
  }, [p, dirtyFields.rate]);

  const effectiveCost = useMemo(() => {
    if (!p) return null;
    return dirtyFields.cost_price !== undefined ? Number(dirtyFields.cost_price) : p.cost_price;
  }, [p, dirtyFields.cost_price]);

  const margin = calculateMargin(effectiveRate, effectiveCost);
  const displayDescription = p?.ai_description || p?.description;
  const isAiDescription = !!p?.ai_description;

  const pk = p?.id ?? 0;

  const stockColor = !p
    ? ''
    : p.stock_on_hand === 0
      ? 'text-red-400'
      : p.stock_on_hand <= 10
        ? 'text-amber-400'
        : 'text-emerald-400';

  const stockBg = !p
    ? ''
    : p.stock_on_hand === 0
      ? 'bg-red-500/10 border-red-500/20'
      : p.stock_on_hand <= 10
        ? 'bg-amber-500/10 border-amber-500/20'
        : 'bg-emerald-500/10 border-emerald-500/20';

  const stockLabel = !p
    ? ''
    : p.stock_on_hand === 0
      ? 'Out of stock'
      : p.stock_on_hand <= 10
        ? 'Low stock'
        : 'In stock';

  return (
    <>
      <SheetContent
        isOpen={open}
        onOpenChange={onOpenChange}
        side="right"
        isFloat={false}
        className="sm:max-w-[580px] w-full backdrop-blur-xl bg-card/95"
        aria-label="Product details"
      >
        {p && (
          <>
            {/* Header - Hero zone */}
            <SheetHeader className="border-b border-border/60 px-5 py-4">
              <div className="flex gap-4 pr-8">
                {/* Product Image */}
                <div className="shrink-0">
                  {p.image_url ? (
                    <motion.img
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={p.image_url}
                      alt={p.name}
                      className="w-20 h-20 object-contain rounded-xl border border-border bg-background"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-dashed border-border/60 bg-muted/30 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <ImagePlus size={18} className="text-muted-foreground/30 group-hover:text-primary/50" />
                      <span className="text-[9px] text-muted-foreground/40 group-hover:text-primary/50">Add image</span>
                    </div>
                  )}
                </div>

                {/* Product identity */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-foreground leading-tight mb-2 pr-4">
                    {p.name}
                  </h2>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={copySku}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border/50 text-[11px] font-mono text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all"
                      title="Copy SKU"
                    >
                      {copiedSku ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                      {p.sku}
                    </button>
                    {p.brand && (
                      <span className="px-2 py-0.5 rounded-md bg-primary/8 border border-primary/15 text-[11px] font-medium text-primary">
                        {p.brand}
                      </span>
                    )}
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[11px] font-medium border',
                        p.status === 'active'
                          ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15'
                          : 'bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <SheetBody className="px-5 py-4 space-y-4 overflow-y-auto">
              {/* Pricing Card — most business-critical info */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-secondary/20 p-4"
              >
                <div className="grid grid-cols-4 gap-4">
                  {/* Cost */}
                  <div className="text-center">
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider block mb-1">
                      Cost
                    </span>
                    {isEditing ? (
                      <Editable
                        key={`cost_price-${pk}`}
                        defaultValue={String(p.cost_price ?? '')}
                        placeholder="—"
                        onSubmit={(val) => handleNumericFieldSubmit('cost_price', val)}
                      >
                        <EditableArea>
                          <EditablePreview className="text-lg font-semibold text-foreground/70 tabular-nums py-0" />
                          <EditableInput className="text-lg font-semibold px-1 w-20 text-center" type="number" />
                        </EditableArea>
                      </Editable>
                    ) : (
                      <span className="text-lg font-semibold text-foreground/70 tabular-nums">
                        {formatCurrency(effectiveCost)}
                      </span>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center justify-center">
                    <ArrowUpRight size={16} className="text-muted-foreground/30" />
                  </div>

                  {/* Rate */}
                  <div className="text-center">
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider block mb-1">
                      Rate
                    </span>
                    {isEditing ? (
                      <Editable
                        key={`rate-${pk}`}
                        defaultValue={String(p.rate ?? '')}
                        placeholder="—"
                        onSubmit={(val) => handleNumericFieldSubmit('rate', val)}
                      >
                        <EditableArea>
                          <EditablePreview className="text-lg font-bold text-foreground tabular-nums py-0" />
                          <EditableInput className="text-lg font-bold px-1 w-20 text-center" type="number" />
                        </EditableArea>
                      </Editable>
                    ) : (
                      <span className="text-lg font-bold text-foreground tabular-nums">
                        {formatCurrency(effectiveRate)}
                      </span>
                    )}
                  </div>

                  {/* Margin gauge */}
                  <MarginGauge margin={margin} />
                </div>
              </motion.div>

              {/* Stock Status */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-xl border',
                  stockBg
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    p.stock_on_hand === 0 ? 'bg-red-400' : p.stock_on_hand <= 10 ? 'bg-amber-400' : 'bg-emerald-400'
                  )} />
                  <div>
                    <span className={cn('text-sm font-semibold tabular-nums', stockColor)}>
                      {p.stock_on_hand.toLocaleString()}
                    </span>
                    {p.unit && <span className="text-xs text-muted-foreground ml-1">{p.unit}</span>}
                  </div>
                </div>
                <span className={cn('text-xs font-medium', stockColor)}>
                  {stockLabel}
                </span>
              </motion.div>

              {/* Description */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                    Description
                  </h3>
                  {isAiDescription && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary border border-primary/15">
                      <Sparkles size={9} />
                      AI Generated
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <Editable
                    key={`desc-${pk}`}
                    defaultValue={displayDescription || ''}
                    placeholder="No description. Click to add..."
                    onSubmit={(val) => {
                      const field = isAiDescription ? 'ai_description' : 'description';
                      handleFieldSubmit(field, val);
                    }}
                  >
                    <EditableArea>
                      <EditablePreview className="text-sm text-foreground/70 leading-relaxed py-0.5" />
                      <EditableInput
                        asChild
                        className="text-sm leading-relaxed min-h-[80px] px-3 py-2 rounded-lg"
                      >
                        <textarea rows={4} />
                      </EditableInput>
                    </EditableArea>
                  </Editable>
                ) : (
                  <p className="text-sm text-foreground/70 leading-relaxed">
                    {displayDescription || (
                      <span className="text-muted-foreground/40 italic">No description</span>
                    )}
                  </p>
                )}
              </motion.div>

              {/* AI Features */}
              {p.ai_features && p.ai_features.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2 flex items-center gap-2">
                    Features
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary border border-primary/15">
                      <Sparkles size={9} />
                      AI
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {p.ai_features.map((feature, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground/70"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Product Details — Collapsible */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <button
                  onClick={() => setDetailsExpanded(!detailsExpanded)}
                  className="flex items-center justify-between w-full py-2 group"
                >
                  <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                    Product Details
                  </h3>
                  <motion.div
                    animate={{ rotate: detailsExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {detailsExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-xl border border-border/40 divide-y divide-border/30">
                        <DetailRow label="SKU" editing={isEditing}>
                          {isEditing ? (
                            <Editable
                              key={`sku-${pk}`}
                              defaultValue={p.sku}
                              onSubmit={(val) => handleFieldSubmit('sku', val)}
                            >
                              <EditableArea>
                                <EditablePreview className="text-sm text-foreground py-0 font-mono" />
                                <EditableInput className="text-sm font-mono px-1" />
                              </EditableArea>
                            </Editable>
                          ) : (
                            <span className="text-sm text-foreground font-mono">{p.sku}</span>
                          )}
                        </DetailRow>

                        <DetailRow label="EAN" editing={isEditing}>
                          {isEditing ? (
                            <Editable
                              key={`ean-${pk}`}
                              defaultValue={p.ean || ''}
                              placeholder="—"
                              onSubmit={(val) => handleFieldSubmit('ean', val)}
                            >
                              <EditableArea>
                                <EditablePreview className="text-sm text-foreground py-0 font-mono" />
                                <EditableInput className="text-sm font-mono px-1" />
                              </EditableArea>
                            </Editable>
                          ) : (
                            <span className="text-sm text-foreground font-mono">{p.ean || '—'}</span>
                          )}
                        </DetailRow>

                        <DetailRow label="Brand" editing={isEditing}>
                          {isEditing ? (
                            <Editable
                              key={`brand-${pk}`}
                              defaultValue={p.brand}
                              onSubmit={(val) => handleFieldSubmit('brand', val)}
                            >
                              <EditableArea>
                                <EditablePreview className="text-sm text-foreground py-0" />
                                <EditableInput className="text-sm px-1" />
                              </EditableArea>
                            </Editable>
                          ) : (
                            <span className="text-sm text-foreground">{p.brand}</span>
                          )}
                        </DetailRow>

                        <DetailRow label="Category" editing={false}>
                          <span className="text-sm text-foreground">{p.category_name || '—'}</span>
                        </DetailRow>

                        <DetailRow label="Pack Qty" editing={isEditing}>
                          {isEditing ? (
                            <Editable
                              key={`pack_qty-${pk}`}
                              defaultValue={String(p.pack_qty ?? '')}
                              placeholder="—"
                              onSubmit={(val) => handleNumericFieldSubmit('pack_qty', val)}
                            >
                              <EditableArea>
                                <EditablePreview className="text-sm text-foreground py-0" />
                                <EditableInput className="text-sm px-1" type="number" />
                              </EditableArea>
                            </Editable>
                          ) : (
                            <span className="text-sm text-foreground">{p.pack_qty ?? '—'}</span>
                          )}
                        </DetailRow>

                        {p.dimensions_formatted && (
                          <DetailRow label="Dimensions" editing={false}>
                            <span className="text-sm text-foreground">{p.dimensions_formatted}</span>
                          </DetailRow>
                        )}

                        <DetailRow label="Materials" editing={isEditing}>
                          {isEditing ? (
                            <Editable
                              key={`materials-${pk}`}
                              defaultValue={p.materials || ''}
                              placeholder="—"
                              onSubmit={(val) => handleFieldSubmit('materials', val)}
                            >
                              <EditableArea>
                                <EditablePreview className="text-sm text-foreground py-0" />
                                <EditableInput className="text-sm px-1" />
                              </EditableArea>
                            </Editable>
                          ) : (
                            <span className="text-sm text-foreground">{p.materials || '—'}</span>
                          )}
                        </DetailRow>

                        <DetailRow label="Color" editing={isEditing}>
                          {isEditing ? (
                            <Editable
                              key={`color-${pk}`}
                              defaultValue={p.color_family || ''}
                              placeholder="—"
                              onSubmit={(val) => handleFieldSubmit('color_family', val)}
                            >
                              <EditableArea>
                                <EditablePreview className="text-sm text-foreground py-0" />
                                <EditableInput className="text-sm px-1" />
                              </EditableArea>
                            </Editable>
                          ) : (
                            <span className="text-sm text-foreground">{p.color_family || '—'}</span>
                          )}
                        </DetailRow>

                        {p.image_url && (
                          <DetailRow label="Image URL" editing={isEditing}>
                            {isEditing ? (
                              <Editable
                                key={`image_url-${pk}`}
                                defaultValue={p.image_url || ''}
                                placeholder="—"
                                onSubmit={(val) => handleFieldSubmit('image_url', val)}
                              >
                                <EditableArea>
                                  <EditablePreview className="text-sm text-foreground py-0 truncate max-w-[300px]" />
                                  <EditableInput className="text-sm px-1" />
                                </EditableArea>
                              </Editable>
                            ) : (
                              <a
                                href={p.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline truncate max-w-[300px] block"
                              >
                                {p.image_url}
                              </a>
                            )}
                          </DetailRow>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Category Path */}
              {(p.category_l1 || p.category_l2 || p.category_l3) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                    Category Path
                  </h3>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {p.category_l1 && <span className="px-2 py-0.5 rounded bg-muted/30 text-xs">{p.category_l1}</span>}
                    {p.category_l2 && (
                      <>
                        <span className="text-muted-foreground/20">/</span>
                        <span className="px-2 py-0.5 rounded bg-muted/30 text-xs">{p.category_l2}</span>
                      </>
                    )}
                    {p.category_l3 && (
                      <>
                        <span className="text-muted-foreground/20">/</span>
                        <span className="px-2 py-0.5 rounded bg-muted/30 text-xs">{p.category_l3}</span>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Integration */}
              {p.zoho_item_id && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="border-t border-border/40 pt-4"
                >
                  <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
                    Integration
                  </h3>
                  <div className="flex items-center justify-between">
                    <a
                      href={`https://inventory.zoho.eu/app#/items/${p.zoho_item_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ExternalLink size={12} />
                      View in Zoho
                    </a>
                    {p.sync_status && (
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-md border font-medium',
                          p.sync_status === 'synced'
                            ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15'
                            : p.sync_status === 'pending_push'
                              ? 'bg-amber-500/8 text-amber-400 border-amber-500/15'
                              : 'bg-red-500/8 text-red-400 border-red-500/15'
                        )}
                      >
                        {p.sync_status === 'synced' ? 'Synced' : p.sync_status === 'pending_push' ? 'Pending' : 'Conflict'}
                      </span>
                    )}
                  </div>
                  {p.sync_status === 'pending_push' && (
                    <p className="text-[11px] text-amber-400/70 mt-1">Changes pending sync to Zoho</p>
                  )}
                </motion.div>
              )}
            </SheetBody>

            {/* Footer */}
            <SheetFooter className="border-t border-border/60 px-5 py-3">
              <div className="flex items-center justify-between w-full">
                {/* Left: Delete */}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
                >
                  <Trash2 size={13} />
                  Delete
                </button>

                {/* Right: Edit / Save / Close */}
                <div className="flex items-center gap-2">
                  {saveError && (
                    <span className="text-xs text-destructive mr-2">{saveError}</span>
                  )}

                  {isEditing ? (
                    <>
                      <Button intent="outline" size="sm" onPress={handleCancelEdit}>
                        <X size={13} className="mr-1" />
                        Cancel
                      </Button>
                      {hasDirtyFields && (
                        <Button
                          intent="primary"
                          size="sm"
                          onPress={handleSave}
                          isDisabled={saving}
                        >
                          {saving && <Loader2 size={13} className="animate-spin mr-1" />}
                          Save Changes
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <SheetClose>
                        <Button intent="outline" size="sm">Close</Button>
                      </SheetClose>
                      <Button intent="primary" size="sm" onPress={() => setIsEditing(true)}>
                        <Pencil size={13} className="mr-1" />
                        Edit
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>

      {/* Delete Confirmation Portal */}
      <AnimatePresence>
        {showDeleteConfirm && p && (
          <DeleteConfirmation
            productName={p.name}
            productSku={p.sku}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function DetailRow({
  label,
  editing,
  children,
}: {
  label: string;
  editing: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      'flex items-center justify-between px-3 py-2 transition-colors',
      editing && 'bg-primary/[0.02]'
    )}>
      <span className="text-xs text-muted-foreground/60 w-24 shrink-0">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}
