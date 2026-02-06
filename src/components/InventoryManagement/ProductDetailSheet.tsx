import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  return ((rate - cost) / cost * 100).toFixed(0);
};

export function ProductDetailSheet({
  product,
  brands,
  open,
  onOpenChange,
  onUpdated,
}: ProductDetailSheetProps) {
  // Keep stale product visible during close animation
  const [staleProduct, setStaleProduct] = useState<Product | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedSku, setCopiedSku] = useState(false);

  // Update stale product whenever we get a real one
  useEffect(() => {
    if (product) setStaleProduct(product);
  }, [product]);

  // The product to render: prefer live data, fall back to stale during close
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
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await productService.update(p.id, { status: 'inactive' });
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  }, [p, onOpenChange, onUpdated]);

  const copySku = useCallback(async () => {
    if (!p) return;
    await navigator.clipboard.writeText(p.sku);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 1500);
  }, [p]);

  // Reset dirty state when product changes
  useEffect(() => {
    setDirtyFields({});
    setSaveError(null);
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

  // Key to force Editable remount when product changes
  const pk = p?.id ?? 0;

  const stockColor = !p ? '' : p.stock_on_hand === 0
    ? 'text-destructive'
    : p.stock_on_hand <= 10
      ? 'text-warning'
      : 'text-success';

  const syncBadge = !p ? { label: '', cls: '' }
    : p.sync_status === 'synced'
      ? { label: 'Synced', cls: 'bg-success/10 text-success border-success/20' }
      : p.sync_status === 'pending_push'
        ? { label: 'Pending', cls: 'bg-warning/10 text-warning border-warning/20' }
        : { label: 'Conflict', cls: 'bg-destructive/10 text-destructive border-destructive/20' };

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-[768px] w-full"
      aria-label="Product details"
    >
      {p && (
        <>
          <SheetHeader className="border-b border-border px-5 py-4">
            <div className="flex gap-4 pr-6">
              <div className="shrink-0">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-14 h-14 object-contain rounded-lg border border-border bg-background"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center">
                    <Package size={20} className="text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <Editable
                  key={`name-${pk}`}
                  defaultValue={p.name}
                  onSubmit={(val) => handleFieldSubmit('name', val)}
                >
                  <EditableArea>
                    <EditablePreview className="text-base font-semibold text-foreground py-0" />
                    <EditableInput className="text-base font-semibold px-1" />
                  </EditableArea>
                </Editable>

                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <button
                    onClick={copySku}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted border border-border text-[11px] font-mono text-muted-foreground hover:border-foreground/30 transition-colors"
                    title="Copy SKU"
                  >
                    {copiedSku ? <Check size={9} className="text-success" /> : <Copy size={9} />}
                    {p.sku}
                  </button>
                  {p.ean && (
                    <span className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 text-[11px] font-mono text-muted-foreground">
                      {p.ean}
                    </span>
                  )}
                  {p.brand && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary">
                      {p.brand}
                    </span>
                  )}
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[11px] font-medium border',
                    p.status === 'active'
                      ? 'bg-success/10 text-success border-success/20'
                      : 'bg-muted text-muted-foreground border-border'
                  )}>
                    {p.status}
                  </span>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                    syncBadge.cls
                  )}>
                    {syncBadge.label}
                  </span>
                </div>
              </div>
            </div>
          </SheetHeader>

          <SheetBody className="px-5 py-4 space-y-5 overflow-y-auto">
            {/* Product Details */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Product Details
              </h3>
              <div className="rounded-lg border border-border divide-y divide-border">
                <DetailRow label="SKU">
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
                </DetailRow>

                <DetailRow label="EAN">
                  <Editable
                    key={`ean-${pk}`}
                    defaultValue={p.ean || ''}
                    placeholder="\u2014"
                    onSubmit={(val) => handleFieldSubmit('ean', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-sm text-foreground py-0 font-mono" />
                      <EditableInput className="text-sm font-mono px-1" />
                    </EditableArea>
                  </Editable>
                </DetailRow>

                {p.upc && (
                  <DetailRow label="UPC">
                    <span className="text-sm text-foreground font-mono">{p.upc}</span>
                  </DetailRow>
                )}

                <DetailRow label="Brand">
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
                </DetailRow>

                <DetailRow label="Category">
                  <span className="text-sm text-foreground">{p.category_name || '\u2014'}</span>
                </DetailRow>

                <DetailRow label="Pack Qty">
                  <Editable
                    key={`pack_qty-${pk}`}
                    defaultValue={String(p.pack_qty ?? '')}
                    placeholder="\u2014"
                    onSubmit={(val) => handleNumericFieldSubmit('pack_qty', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-sm text-foreground py-0" />
                      <EditableInput className="text-sm px-1" type="number" />
                    </EditableArea>
                  </Editable>
                </DetailRow>

                {p.dimensions_formatted && (
                  <DetailRow label="Dimensions">
                    <span className="text-sm text-foreground">{p.dimensions_formatted}</span>
                  </DetailRow>
                )}

                <DetailRow label="Materials">
                  <Editable
                    key={`materials-${pk}`}
                    defaultValue={p.materials || ''}
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
                    key={`color-${pk}`}
                    defaultValue={p.color_family || ''}
                    placeholder="\u2014"
                    onSubmit={(val) => handleFieldSubmit('color_family', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-sm text-foreground py-0" />
                      <EditableInput className="text-sm px-1" />
                    </EditableArea>
                  </Editable>
                </DetailRow>

                {p.variant && (
                  <DetailRow label="Variant">
                    <span className="text-sm text-foreground">{p.variant}</span>
                  </DetailRow>
                )}

                <DetailRow label="Image URL">
                  <Editable
                    key={`image_url-${pk}`}
                    defaultValue={p.image_url || ''}
                    placeholder="\u2014"
                    onSubmit={(val) => handleFieldSubmit('image_url', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-sm text-foreground py-0 truncate max-w-[400px]" />
                      <EditableInput className="text-sm px-1" />
                    </EditableArea>
                  </Editable>
                </DetailRow>
              </div>
            </div>

            {/* Pricing & Stock */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Pricing & Stock
              </h3>
              <div className="rounded-lg border border-border divide-y divide-border">
                <DetailRow label="Stock">
                  <span className={cn('text-sm font-medium tabular-nums', stockColor)}>
                    {p.stock_on_hand.toLocaleString()}
                    {p.unit && <span className="text-muted-foreground font-normal ml-1">{p.unit}</span>}
                  </span>
                </DetailRow>

                <DetailRow label="Cost Price">
                  <Editable
                    key={`cost_price-${pk}`}
                    defaultValue={String(p.cost_price ?? '')}
                    placeholder="\u2014"
                    onSubmit={(val) => handleNumericFieldSubmit('cost_price', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-sm text-foreground tabular-nums py-0" />
                      <EditableInput className="text-sm px-1 w-24" type="number" />
                    </EditableArea>
                  </Editable>
                </DetailRow>

                <DetailRow label="Rate">
                  <Editable
                    key={`rate-${pk}`}
                    defaultValue={String(p.rate ?? '')}
                    placeholder="\u2014"
                    onSubmit={(val) => handleNumericFieldSubmit('rate', val)}
                  >
                    <EditableArea>
                      <EditablePreview className="text-sm font-medium text-foreground tabular-nums py-0" />
                      <EditableInput className="text-sm font-medium px-1 w-24" type="number" />
                    </EditableArea>
                  </Editable>
                </DetailRow>

                <DetailRow label="Margin">
                  <span className={cn(
                    'text-sm tabular-nums',
                    margin && parseInt(margin) > 30 ? 'text-success' :
                    margin && parseInt(margin) > 15 ? 'text-foreground' : 'text-warning'
                  )}>
                    {margin ? `${margin}%` : '\u2014'}
                  </span>
                </DetailRow>
              </div>
            </div>

            {/* Description */}
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
                key={`desc-${pk}`}
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

            {/* AI Features */}
            {p.ai_features && p.ai_features.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                  Features
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary border border-primary/20">
                    <Sparkles size={10} />
                    AI
                  </span>
                </h3>
                <ul className="space-y-1">
                  {p.ai_features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="text-primary mt-0.5">&bull;</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Category Path */}
            {(p.category_l1 || p.category_l2 || p.category_l3) && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Category Path
                </h3>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {p.category_l1 && <span>{p.category_l1}</span>}
                  {p.category_l2 && (
                    <>
                      <span className="text-muted-foreground/40">/</span>
                      <span>{p.category_l2}</span>
                    </>
                  )}
                  {p.category_l3 && (
                    <>
                      <span className="text-muted-foreground/40">/</span>
                      <span>{p.category_l3}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Integration */}
            {p.zoho_item_id && (
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
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
                </div>
                {p.sync_status === 'pending_push' && (
                  <p className="text-[11px] text-warning mt-1">Changes pending sync to Zoho</p>
                )}
              </div>
            )}
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
        </>
      )}
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
