import React, { useState, useCallback, useMemo } from 'react';
import {
  Package,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Loader2,
  Trash2,
} from 'lucide-react';
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

// Safe dynamic field access for Product
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

const formatCurrency = (value: number | null | undefined) => {
  if (value === undefined || value === null) return '\u2014';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
};

const calculateMargin = (rate: number | null | undefined, cost: number | null | undefined) => {
  if (!rate || !cost || cost === 0) return null;
  return ((rate - cost) / cost * 100).toFixed(0);
};

export function ProductDetailSheet({
  product,
  brands,
  open,
  onOpenChange,
  onUpdated,
}: ProductDetailSheetProps) {
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedSku, setCopiedSku] = useState(false);

  const hasDirtyFields = Object.keys(dirtyFields).length > 0;

  const handleFieldSubmit = useCallback((field: string, value: string) => {
    if (!product) return;
    const currentVal = String(getProductField(product, field) ?? '');
    if (value === currentVal) {
      // Remove from dirty if reverted
      setDirtyFields((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return;
    }
    setDirtyFields((prev) => ({ ...prev, [field]: value }));
  }, [product]);

  const handleNumericFieldSubmit = useCallback((field: string, value: string) => {
    if (!product) return;
    const numVal = parseFloat(value) || 0;
    const currentVal = getProductField(product, field);
    if (numVal === Number(currentVal ?? 0)) {
      setDirtyFields((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return;
    }
    setDirtyFields((prev) => ({ ...prev, [field]: numVal }));
  }, [product]);

  const handleSave = useCallback(async () => {
    if (!product || !hasDirtyFields) return;
    setSaving(true);
    setSaveError(null);
    try {
      await productService.update(product.id, dirtyFields as Partial<Product>);
      setDirtyFields({});
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save changes';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [product, dirtyFields, hasDirtyFields, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (!product) return;
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await productService.update(product.id, { status: 'inactive' });
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  }, [product, onOpenChange, onUpdated]);

  const copySku = useCallback(async () => {
    if (!product) return;
    await navigator.clipboard.writeText(product.sku);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 1500);
  }, [product]);

  // Reset dirty state when product changes
  React.useEffect(() => {
    setDirtyFields({});
    setSaveError(null);
  }, [product?.id]);

  // Computed values using dirty overrides
  const effectiveRate = useMemo(() => {
    if (!product) return null;
    return dirtyFields.rate !== undefined ? Number(dirtyFields.rate) : product.rate;
  }, [product, dirtyFields.rate]);

  const effectiveCost = useMemo(() => {
    if (!product) return null;
    return dirtyFields.cost_price !== undefined ? Number(dirtyFields.cost_price) : product.cost_price;
  }, [product, dirtyFields.cost_price]);

  const margin = calculateMargin(effectiveRate, effectiveCost);

  const displayDescription = product?.ai_description || product?.description;
  const isAiDescription = !!product?.ai_description;

  const getFieldValue = (field: string): string => {
    if (!product) return '';
    if (dirtyFields[field] !== undefined) return String(dirtyFields[field]);
    return String(getProductField(product, field) ?? '');
  };

  if (!product) return null;

  const stockColor = product.stock_on_hand === 0
    ? 'text-destructive'
    : product.stock_on_hand <= 10
      ? 'text-warning'
      : 'text-success';

  const syncBadge = product.sync_status === 'synced'
    ? { label: 'Synced', cls: 'bg-success/10 text-success border-success/20' }
    : product.sync_status === 'pending_push'
      ? { label: 'Pending', cls: 'bg-warning/10 text-warning border-warning/20' }
      : { label: 'Conflict', cls: 'bg-destructive/10 text-destructive border-destructive/20' };

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-2xl w-full"
      aria-label="Product details"
    >
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex-1 min-w-0 pr-6">
            {/* Product name - editable */}
            <Editable
              defaultValue={product.name}
              onSubmit={(val) => handleFieldSubmit('name', val)}
            >
              <EditableArea>
                <EditablePreview className="text-lg font-semibold text-foreground py-0" />
                <EditableInput className="text-lg font-semibold px-1" />
              </EditableArea>
            </Editable>

            {/* Meta strip */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                onClick={copySku}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted border border-border text-[11px] font-mono text-muted-foreground hover:border-foreground/30 transition-colors"
                title="Copy SKU"
              >
                {copiedSku ? <Check size={10} className="text-success" /> : <Copy size={10} />}
                {product.sku}
              </button>
              {product.ean && (
                <span className="px-2 py-0.5 rounded bg-muted/50 border border-border/50 text-[11px] font-mono text-muted-foreground">
                  EAN: {product.ean}
                </span>
              )}
              {product.brand && (
                <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary">
                  {product.brand}
                </span>
              )}
              {product.category_name && (
                <span className="px-2 py-0.5 rounded bg-muted/50 text-[11px] text-muted-foreground">
                  {product.category_name}
                </span>
              )}
              <span className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium border',
                product.status === 'active'
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-muted text-muted-foreground border-border'
              )}>
                {product.status}
              </span>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="px-5 py-4 space-y-5 overflow-y-auto">
          {/* Section 1: Image + Key Metrics */}
          <div className="flex gap-4">
            {/* Image */}
            <div className="shrink-0">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-28 h-28 object-contain rounded-lg border border-border bg-background"
                />
              ) : (
                <div className="w-28 h-28 rounded-lg border border-border bg-muted flex items-center justify-center">
                  <Package size={28} className="text-muted-foreground" />
                </div>
              )}
              {/* Image URL edit */}
              <Editable
                defaultValue={product.image_url || ''}
                placeholder="Image URL..."
                onSubmit={(val) => handleFieldSubmit('image_url', val)}
              >
                <EditableArea className="mt-1.5">
                  <EditablePreview className="text-[11px] text-muted-foreground truncate max-w-28 py-0.5 px-1" />
                  <EditableInput className="text-[11px] w-28 px-1" />
                </EditableArea>
              </Editable>
            </div>

            {/* Key metrics grid */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Stock</div>
                <div className={cn('text-lg font-semibold tabular-nums', stockColor)}>
                  {product.stock_on_hand.toLocaleString()}
                </div>
                {product.unit && (
                  <div className="text-[11px] text-muted-foreground">{product.unit}</div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cost Price</div>
                <Editable
                  defaultValue={String(product.cost_price ?? '')}
                  placeholder="\u2014"
                  onSubmit={(val) => handleNumericFieldSubmit('cost_price', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-lg font-semibold tabular-nums text-foreground py-0" />
                    <EditableInput className="text-lg font-semibold w-full px-1" type="number" />
                  </EditableArea>
                </Editable>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rate</div>
                <Editable
                  defaultValue={String(product.rate ?? '')}
                  placeholder="\u2014"
                  onSubmit={(val) => handleNumericFieldSubmit('rate', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-lg font-semibold tabular-nums text-success py-0" />
                    <EditableInput className="text-lg font-semibold w-full px-1" type="number" />
                  </EditableArea>
                </Editable>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Margin</div>
                <div className={cn(
                  'text-lg font-semibold tabular-nums',
                  margin && parseInt(margin) > 30 ? 'text-success' :
                  margin && parseInt(margin) > 15 ? 'text-foreground' : 'text-warning'
                )}>
                  {margin ? `${margin}%` : '\u2014'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Product Details */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Product Details
            </h3>
            <div className="rounded-lg border border-border divide-y divide-border">
              <DetailRow label="SKU">
                <Editable
                  defaultValue={product.sku}
                  onSubmit={(val) => handleFieldSubmit('sku', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-sm text-foreground py-0 font-mono" />
                    <EditableInput className="text-sm font-mono px-1" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              <DetailRow label="EAN">
                <Editable
                  defaultValue={product.ean || ''}
                  placeholder="\u2014"
                  onSubmit={(val) => handleFieldSubmit('ean', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-sm text-foreground py-0 font-mono" />
                    <EditableInput className="text-sm font-mono px-1" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              {product.upc && (
                <DetailRow label="UPC">
                  <span className="text-sm text-foreground font-mono">{product.upc}</span>
                </DetailRow>
              )}

              <DetailRow label="Brand">
                <Editable
                  defaultValue={getFieldValue('brand')}
                  onSubmit={(val) => handleFieldSubmit('brand', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-sm text-foreground py-0" />
                    <EditableInput className="text-sm px-1" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              <DetailRow label="Category">
                <span className="text-sm text-foreground">{product.category_name || '\u2014'}</span>
              </DetailRow>

              <DetailRow label="Pack Qty">
                <Editable
                  defaultValue={String(product.pack_qty ?? '')}
                  placeholder="\u2014"
                  onSubmit={(val) => handleNumericFieldSubmit('pack_qty', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-sm text-foreground py-0" />
                    <EditableInput className="text-sm px-1" type="number" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              {product.dimensions_formatted && (
                <DetailRow label="Dimensions">
                  <span className="text-sm text-foreground">{product.dimensions_formatted}</span>
                </DetailRow>
              )}

              <DetailRow label="Materials">
                <Editable
                  defaultValue={product.materials || ''}
                  placeholder="\u2014"
                  onSubmit={(val) => handleFieldSubmit('materials', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-sm text-foreground py-0" />
                    <EditableInput className="text-sm px-1" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              <DetailRow label="Color">
                <Editable
                  defaultValue={product.color_family || ''}
                  placeholder="\u2014"
                  onSubmit={(val) => handleFieldSubmit('color_family', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-sm text-foreground py-0" />
                    <EditableInput className="text-sm px-1" />
                  </EditableArea>
                </Editable>
              </DetailRow>

              {product.variant && (
                <DetailRow label="Variant">
                  <span className="text-sm text-foreground">{product.variant}</span>
                </DetailRow>
              )}
            </div>
          </div>

          {/* Section 3: Description */}
          {(displayDescription || true) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Description
                </h3>
                {isAiDescription && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary border border-primary/20">
                    <Sparkles size={10} />
                    AI Generated
                  </span>
                )}
              </div>
              <Editable
                defaultValue={displayDescription || ''}
                placeholder="No description. Click to add..."
                onSubmit={(val) => {
                  const field = isAiDescription ? 'ai_description' : 'description';
                  handleFieldSubmit(field, val);
                }}
              >
                <EditableArea>
                  <EditablePreview className="text-sm text-foreground/80 leading-relaxed py-0.5" />
                  <EditableInput
                    asChild
                    className="text-sm leading-relaxed min-h-[60px] px-2 py-1"
                  >
                    <textarea rows={3} />
                  </EditableInput>
                </EditableArea>
              </Editable>
            </div>
          )}

          {/* Section 4: AI Features */}
          {product.ai_features && product.ai_features.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                Features
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary border border-primary/20">
                  <Sparkles size={10} />
                  AI
                </span>
              </h3>
              <ul className="space-y-1">
                {product.ai_features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <span className="text-primary mt-0.5">&bull;</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section 5: Category Path */}
          {(product.category_l1 || product.category_l2 || product.category_l3) && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Category Path
              </h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {product.category_l1 && <span>{product.category_l1}</span>}
                {product.category_l2 && (
                  <>
                    <span className="text-muted-foreground/40">/</span>
                    <span>{product.category_l2}</span>
                  </>
                )}
                {product.category_l3 && (
                  <>
                    <span className="text-muted-foreground/40">/</span>
                    <span>{product.category_l3}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Section 6: Integration */}
          <div className="border-t border-border pt-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Integration
            </h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {product.zoho_item_id && (
                  <a
                    href={`https://inventory.zoho.eu/app#/items/${product.zoho_item_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink size={12} />
                    View in Zoho
                  </a>
                )}
              </div>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded border font-medium',
                syncBadge.cls
              )}>
                {syncBadge.label}
              </span>
            </div>
            {product.sync_status !== 'synced' && product.sync_status === 'pending_push' && (
              <p className="text-[11px] text-warning mt-1">Changes pending sync to Zoho</p>
            )}
          </div>
        </SheetBody>

        <SheetFooter className="border-t border-border px-5 py-3">
          <div className="flex items-center justify-between w-full">
            <button
              onClick={handleDelete}
              className="text-sm text-destructive hover:text-destructive/80 transition-colors"
            >
              <Trash2 size={14} className="inline mr-1" />
              Delete
            </button>
            <div className="flex items-center gap-2">
              {saveError && (
                <span className="text-xs text-destructive mr-2">{saveError}</span>
              )}
              <SheetClose>
                <Button intent="outline" size="sm">Close</Button>
              </SheetClose>
              {hasDirtyFields && (
                <Button
                  intent="primary"
                  size="sm"
                  onPress={handleSave}
                  isDisabled={saving}
                >
                  {saving && <Loader2 size={14} className="animate-spin mr-1" />}
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </SheetFooter>
    </SheetContent>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}
