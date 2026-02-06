import React, { useState } from 'react';
import {
  Barcode,
  DollarSign,
  Warehouse,
  Image,
  Tag,
  Info,
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { productService } from '../../services/productService';
import {
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface AddProductSheetProps {
  brands: Array<{ brand: string; count: number }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: () => void;
}

const AddProductSheet: React.FC<AddProductSheetProps> = ({ brands, open, onOpenChange, onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    ean: '',
    brand: '',
    category: '',
    description: '',
    stock_on_hand: 0,
    reorder_level: 0,
    rate: 0,
    cost_price: 0,
    status: 'active',
    image_url: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'rate' || name === 'cost_price' || name === 'stock_on_hand' || name === 'reorder_level'
        ? parseFloat(value) || 0
        : value
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Product name is required');
      return false;
    }
    if (!formData.sku.trim()) {
      setError('SKU is required');
      return false;
    }
    if (!formData.brand) {
      setError('Brand is required');
      return false;
    }
    if (formData.rate <= 0) {
      setError('Rate (selling price) must be greater than 0');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // TODO: Implement productService.create() method in productService.ts
      // The backend endpoint POST /api/v1/products needs to be created
      console.warn('productService.create() not yet implemented - product creation requires backend endpoint');
      throw new Error('Product creation endpoint not yet implemented. Please add product via Zoho Inventory.');

      // When implemented:
      // await productService.create({
      //   name: formData.name,
      //   sku: formData.sku,
      //   ean: formData.ean,
      //   brand: formData.brand,
      //   category_name: formData.category,
      //   description: formData.description,
      //   stock_on_hand: formData.stock_on_hand,
      //   rate: formData.rate,
      //   rrp: formData.rrp,
      //   status: formData.status as 'active' | 'inactive',
      //   image_url: formData.image_url || null
      // });
      // onAdd();
    } catch (err: any) {
      setError(err.message || 'Failed to add product');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (!formData.name || !formData.sku || !formData.brand) {
        setError('Product name, SKU, and brand are required');
        return;
      }
    }
    setError(null);
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setError(null);
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const margin = formData.rate && formData.cost_price && formData.cost_price > 0
    ? ((formData.rate - formData.cost_price) / formData.cost_price * 100).toFixed(1)
    : '0';

  const steps = [
    { num: 1, label: 'Basic Info' },
    { num: 2, label: 'Pricing & Stock' },
    { num: 3, label: 'Additional Details' },
  ];

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-xl w-full"
      aria-label="Add new product"
    >
      <SheetHeader className="border-b border-border px-5 py-4">
        <div className="pr-6">
          <h2 className="text-base font-semibold text-foreground">Add New Product</h2>
          {/* Step Indicator */}
          <div className="flex items-center gap-3 mt-3">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  currentStep >= s.num
                    ? 'bg-primary text-primary-fg'
                    : 'bg-muted border border-border text-muted-foreground'
                }`}>
                  {s.num}
                </div>
                <span className={`text-xs ${currentStep >= s.num ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-6 h-px ${currentStep > s.num ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <SheetBody className="px-5 py-4 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive mb-4">
              {error}
            </div>
          )}

          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Info size={16} className="text-muted-foreground" /> Basic Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Product Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter product name"
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Barcode size={12} /> SKU *
                  </label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    placeholder="Enter unique SKU"
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Barcode size={12} /> EAN/Barcode
                  </label>
                  <input
                    type="text"
                    name="ean"
                    value={formData.ean}
                    onChange={handleInputChange}
                    placeholder="Enter EAN/Barcode"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Tag size={12} /> Brand *
                  </label>
                  <select
                    name="brand"
                    value={formData.brand}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Select Brand</option>
                    {brands.map(b => (
                      <option key={b.brand} value={b.brand}>
                        {b.brand}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    placeholder="Enter category"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Pricing & Stock */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign size={16} className="text-muted-foreground" /> Pricing & Stock Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Cost Price (Supplier)</label>
                  <input
                    type="number"
                    name="cost_price"
                    value={formData.cost_price}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Rate (Selling Price) *</label>
                  <input
                    type="number"
                    name="rate"
                    value={formData.rate}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Margin</label>
                  <input
                    type="text"
                    value={`${margin}%`}
                    disabled
                    className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-muted-foreground text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Warehouse size={12} /> Initial Stock
                  </label>
                  <input
                    type="number"
                    name="stock_on_hand"
                    value={formData.stock_on_hand}
                    onChange={handleInputChange}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Reorder Level</label>
                  <input
                    type="number"
                    name="reorder_level"
                    value={formData.reorder_level}
                    onChange={handleInputChange}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Additional Details */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Image size={16} className="text-muted-foreground" /> Additional Details
              </h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Image URL</label>
                  <input
                    type="text"
                    name="image_url"
                    value={formData.image_url}
                    onChange={handleInputChange}
                    placeholder="Enter image URL (optional)"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Product Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={6}
                    placeholder="Enter detailed product description..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
            </div>
          )}
        </SheetBody>

        <SheetFooter className="border-t border-border px-5 py-3">
          <div className="flex items-center justify-between w-full">
            <div>
              {currentStep > 1 && (
                <Button intent="outline" size="sm" onPress={prevStep}>
                  <ChevronLeft size={16} className="mr-1" />
                  Previous
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button intent="outline" size="sm" onPress={() => onOpenChange(false)}>
                Cancel
              </Button>
              {currentStep < 3 ? (
                <Button intent="primary" size="sm" onPress={nextStep}>
                  Next
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              ) : (
                <Button
                  intent="primary"
                  size="sm"
                  type="submit"
                  isDisabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus size={14} className="mr-1" />
                      Add Product
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </SheetFooter>
      </form>
    </SheetContent>
  );
};

export default AddProductSheet;
