import React, { useState } from 'react';
import {
  X,
  Save,
  Barcode,
  Package,
  DollarSign,
  Warehouse,
  Image,
  Tag,
  Info,
  Loader2
} from 'lucide-react';
import { productService } from '../../services/productService';
// Note: This component is unused (ProductDetailSheet handles editing inline).
// Kept for reference but CSS module import removed.
const styles: Record<string, string> = {};

// Internal inventory item interface for the modal form
// Maps to Product type from backend with field transformations
interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  ean?: string;
  description?: string;
  category?: string;
  brand: string; // brand name (string), not brand_id
  gross_stock_level: number; // maps to stock_on_hand
  reorder_level: number;
  cost_price?: number; // what we pay suppliers
  rate?: number; // selling price
  status: string;
  image_url?: string;
}

interface EditProductModalProps {
  product: InventoryItem;
  brands: Array<{ brand: string; count: number }>; // From productService.getBrands()
  onClose: () => void;
  onUpdate: () => void;
}

const EditProductModal: React.FC<EditProductModalProps> = ({
  product,
  brands,
  onClose,
  onUpdate
}) => {
  const [formData, setFormData] = useState({
    name: product.name || '',
    sku: product.sku || '',
    ean: product.ean || '',
    brand: product.brand || '',
    category: product.category || '',
    description: product.description || '',
    stock_on_hand: product.gross_stock_level || 0,
    reorder_level: product.reorder_level || 0,
    cost_price: product.cost_price || 0,
    rate: product.rate || 0,
    status: product.status || 'active',
    image_url: product.image_url || ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Map form fields to Product type expected by backend
      await productService.update(parseInt(product.id), {
        name: formData.name,
        sku: formData.sku,
        ean: formData.ean,
        brand: formData.brand,
        category_name: formData.category,
        description: formData.description,
        stock_on_hand: formData.stock_on_hand,
        cost_price: formData.cost_price,
        rate: formData.rate,
        status: formData.status as 'active' | 'inactive',
        image_url: formData.image_url || null
      });

      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to update product');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const margin = formData.rate && formData.cost_price && formData.cost_price > 0
    ? ((formData.rate - formData.cost_price) / formData.cost_price * 100).toFixed(1)
    : '0';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Edit Product</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && (
              <div className={styles.errorMessage}>
                {error}
              </div>
            )}

            {/* Basic Information */}
            <div className={styles.formStep}>
              <h3><Info size={18} /> Basic Information</h3>
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label>Product Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label><Barcode size={16} /> SKU *</label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label><Barcode size={16} /> EAN/Barcode</label>
                  <input
                    type="text"
                    name="ean"
                    value={formData.ean}
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label><Tag size={16} /> Brand *</label>
                  <select
                    name="brand"
                    value={formData.brand}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Brand</option>
                    {brands.map(b => (
                      <option key={b.brand} value={b.brand}>
                        {b.brand}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Category</label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Pricing & Stock */}
            <div className={styles.formStep}>
              <h3><DollarSign size={18} /> Pricing & Stock Information</h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Cost Price (Supplier)</label>
                  <input
                    type="number"
                    name="cost_price"
                    value={formData.cost_price}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Rate (Selling Price) *</label>
                  <input
                    type="number"
                    name="rate"
                    value={formData.rate}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Margin</label>
                  <input
                    type="text"
                    value={`${margin}%`}
                    disabled
                    className={styles.marginInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label><Warehouse size={16} /> Stock Level</label>
                  <input
                    type="number"
                    name="stock_on_hand"
                    value={formData.stock_on_hand}
                    onChange={handleInputChange}
                    min="0"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Reorder Level</label>
                  <input
                    type="number"
                    name="reorder_level"
                    value={formData.reorder_level}
                    onChange={handleInputChange}
                    min="0"
                  />
                </div>
              </div>
            </div>

            {/* Additional Details */}
            <div className={styles.formStep}>
              <h3><Image size={18} /> Additional Details</h3>
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label>Image URL</label>
                  <input
                    type="text"
                    name="image_url"
                    value={formData.image_url}
                    onChange={handleInputChange}
                    placeholder="Enter image URL (optional)"
                  />
                </div>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label>Product Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="Enter detailed product description..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <div className={styles.footerLeft}></div>
            <div className={styles.footerRight}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={18} className={styles.spinner} />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProductModal;
