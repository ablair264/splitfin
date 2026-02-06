import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Package2,
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Image,
  Sparkles,
  Upload
} from 'lucide-react';
import { productService } from '../../services/productService';
import { useLoader } from '../../contexts/LoaderContext';
import ProductDetailsModal from './ProductDetailsModal';
import EditProductModal from './EditProductModal';
import AddProductModal from './AddProductModal';
import { AIProductEnricher } from '../AIProductEnricher';
import PricelistUpload from './PricelistUpload';
import type { Product } from '../../types/domain';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 25;

// Internal inventory item interface for UI display
// Maps from backend Product type
interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  ean?: string;
  description?: string;
  category?: string;
  brand: string;
  gross_stock_level: number; // mapped from stock_on_hand
  reorder_level: number;
  cost_price?: number; // what we pay suppliers
  rate?: number; // selling price
  status: string;
  image_url?: string;
  created_date: string;
}

// Map backend Product to internal InventoryItem
const mapProductToInventoryItem = (product: Product): InventoryItem => ({
  id: String(product.id),
  name: product.name,
  sku: product.sku,
  ean: product.ean || undefined,
  description: product.description || undefined,
  category: product.category_name || undefined,
  brand: product.brand,
  gross_stock_level: product.stock_on_hand,
  reorder_level: 0,
  cost_price: product.cost_price,
  rate: product.rate,
  status: product.status,
  image_url: product.image_url || undefined,
  created_date: product.created_at
});

const InventoryProducts: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showLoader, hideLoader } = useLoader();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    brand: searchParams.get('brand') || '',
    stockFilter: searchParams.get('filter') || '',
    sort: searchParams.get('sort') || 'stock_desc'
  });

  // Modal states
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIEnrichModal, setShowAIEnrichModal] = useState(false);
  const [showPricelistUpload, setShowPricelistUpload] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);

  const fetchBrands = useCallback(async () => {
    try {
      const brandsData = await productService.getBrands();
      setBrands(brandsData);
    } catch (err) {
      console.error('Error in fetchBrands:', err);
    }
  }, []);

  const loadItems = useCallback(async (page = 1, isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        showLoader('Loading Inventory...');
      }
      setLoading(true);
      setError(null);

      const countFilters: { status?: string; brand?: string } = { status: 'active' };
      if (filters.brand) countFilters.brand = filters.brand;

      const apiFilters: Record<string, string | number> = {
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE
      };

      if (filters.brand) apiFilters.brand = filters.brand;
      if (filters.search) apiFilters.search = filters.search;
      apiFilters.status = 'active';

      // Fetch items and total count in parallel
      const [response, totalCount] = await Promise.all([
        productService.list(apiFilters),
        productService.count(countFilters),
      ]);

      if (response.data) {
        setRawProducts(response.data);
        let mappedItems = response.data.map(mapProductToInventoryItem);

        // Client-side stock filtering (until backend supports it)
        if (filters.stockFilter === 'out-of-stock') {
          mappedItems = mappedItems.filter(item => item.gross_stock_level === 0);
        } else if (filters.stockFilter === 'low-stock') {
          mappedItems = mappedItems.filter(item =>
            item.reorder_level > 0 && item.gross_stock_level <= item.reorder_level
          );
        } else if (filters.stockFilter === 'in-stock') {
          mappedItems = mappedItems.filter(item => item.gross_stock_level > 0);
        }

        // Client-side sorting (until backend supports it)
        switch (filters.sort) {
          case 'created_newest':
            mappedItems.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
            break;
          case 'created_oldest':
            mappedItems.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
            break;
          case 'name_asc':
            mappedItems.sort((a, b) => a.name.localeCompare(b.name));
            break;
          case 'name_desc':
            mappedItems.sort((a, b) => b.name.localeCompare(a.name));
            break;
          case 'stock_asc':
            mappedItems.sort((a, b) => a.gross_stock_level - b.gross_stock_level);
            break;
          case 'stock_desc':
            mappedItems.sort((a, b) => b.gross_stock_level - a.gross_stock_level);
            break;
        }

        setItems(mappedItems);
        setTotalItems(totalCount);
        setTotalPages(Math.ceil(totalCount / ITEMS_PER_PAGE));
        setCurrentPage(page);
      }
    } catch (err) {
      console.error('Error loading items:', err);
      setError('Failed to load products');
    } finally {
      setLoading(false);
      if (isInitialLoad) hideLoader();
    }
  }, [filters, showLoader, hideLoader]);

  // Load brands and items on mount
  useEffect(() => {
    const init = async () => {
      showLoader('Loading Inventory...');
      await fetchBrands();
    };
    init();
  }, [fetchBrands, showLoader]);

  // Load items when filters change
  useEffect(() => {
    loadItems(1, items.length === 0);
  }, [filters, loadItems]);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);

    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    setSearchParams(params);
  };

  const handlePageChange = (page: number) => {
    loadItems(page, false);
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await productService.update(parseInt(id), { status: 'inactive' });
        loadItems(currentPage, false);
      } catch (err) {
        console.error('Error deleting product:', err);
        setError('Failed to delete product');
      }
    }
  };

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return '---';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(value);
  };

  const stockColor = (level: number) => {
    if (level === 0) return 'text-red-400';
    if (level <= 5) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const stockBadge = (level: number) => {
    if (level === 0) return { label: 'Out', cls: 'bg-red-400/10 text-red-400 border-red-400/20' };
    if (level <= 5) return { label: 'Low', cls: 'bg-amber-400/10 text-amber-400 border-amber-400/20' };
    return { label: 'In Stock', cls: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' };
  };

  // ProgressLoader handles initial load
  if (loading && items.length === 0 && !error) {
    return null;
  }

  // Empty state
  if (!loading && items.length === 0 && !error) {
    return (
      <div className="min-h-screen text-white p-4">
        <div className="bg-[#1a1f2a] rounded-xl border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <span className="text-sm text-gray-400">0 products</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAIEnrichModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-brand-300/10 text-brand-300 border border-brand-300/20 rounded-lg text-sm font-medium hover:bg-brand-300/20 transition-colors"
              >
                <Sparkles size={14} /> AI Enhance
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-300 to-[#4daeac] text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-brand-300/25 transition-all"
              >
                <Plus size={16} /> Add Product
              </button>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Package2 size={48} className="mb-4 opacity-40" />
            <h3 className="text-lg font-semibold text-gray-300 mb-1">No products found</h3>
            <p className="text-sm text-gray-500 mb-4">Get started by adding your first product to the inventory</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-300 to-[#4daeac] text-white rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> Add First Product
            </button>
          </div>
        </div>

        {showAddModal && (
          <AddProductModal
            brands={brands}
            onClose={() => setShowAddModal(false)}
            onAdd={() => { loadItems(1, false); setShowAddModal(false); }}
          />
        )}
        {showAIEnrichModal && (
          <AIProductEnricher
            companyId="dm-brands"
            onClose={() => setShowAIEnrichModal(false)}
            onComplete={() => { loadItems(currentPage, false); setShowAIEnrichModal(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-4">
      {/* Table Card */}
      <div className="bg-[#1a1f2a] rounded-xl border border-gray-700 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
            />
          </div>

          {/* Brand filter */}
          <select
            value={filters.brand}
            onChange={(e) => handleFilterChange('brand', e.target.value)}
            className="px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm cursor-pointer transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
          >
            <option value="">All Brands</option>
            {brands.map(b => (
              <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>
            ))}
          </select>

          {/* Stock filter */}
          <select
            value={filters.stockFilter}
            onChange={(e) => handleFilterChange('stockFilter', e.target.value)}
            className="px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm cursor-pointer transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
          >
            <option value="">All Stock</option>
            <option value="in-stock">In Stock</option>
            <option value="low-stock">Low Stock</option>
            <option value="out-of-stock">Out of Stock</option>
          </select>

          {/* Sort */}
          <select
            value={filters.sort}
            onChange={(e) => handleFilterChange('sort', e.target.value)}
            className="px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm cursor-pointer transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30"
          >
            <option value="stock_desc">Stock: High to Low</option>
            <option value="stock_asc">Stock: Low to High</option>
            <option value="name_asc">Name: A-Z</option>
            <option value="name_desc">Name: Z-A</option>
            <option value="created_newest">Newest First</option>
            <option value="created_oldest">Oldest First</option>
          </select>

          {/* Actions */}
          <button
            onClick={() => setShowPricelistUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-400/80 border border-amber-400/25 bg-amber-400/5 rounded-lg hover:text-amber-400 hover:border-amber-400/40 hover:bg-amber-400/10 transition-all shrink-0"
          >
            <Upload size={14} /> Pricelists
          </button>
          <button
            onClick={() => setShowAIEnrichModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-300/80 border border-brand-300/25 bg-brand-300/5 rounded-lg hover:text-brand-300 hover:border-brand-300/40 hover:bg-brand-300/10 transition-all shrink-0"
          >
            <Sparkles size={14} /> AI Enhance
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-300 to-[#4daeac] text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-brand-300/25 transition-all shrink-0"
          >
            <Plus size={16} /> Add Product
          </button>
        </div>

        {/* Results count */}
        <div className="px-5 py-2 text-xs text-gray-500 border-b border-gray-700/40">
          {totalItems} product{totalItems !== 1 ? 's' : ''}
          {filters.search && ` matching "${filters.search}"`}
          {filters.brand && ` in ${filters.brand}`}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 my-3 flex items-center gap-2 px-4 py-2.5 rounded-md bg-red-400/10 border border-red-400/20 text-[13px] text-red-400">
            <XCircle size={14} /> {error}
          </div>
        )}

        {/* Table Header */}
        <div className="hidden lg:grid grid-cols-[minmax(200px,2fr)_minmax(80px,1fr)_minmax(100px,1fr)_70px_80px_80px_140px] gap-3 px-4 py-3 bg-gradient-to-r from-[#2a3441] to-[#1e2532] border-b border-gray-700 text-[11px] font-semibold text-gray-400 uppercase tracking-wider items-center">
          <div>Product</div>
          <div>Brand</div>
          <div>Category</div>
          <div className="text-right">Stock</div>
          <div className="text-right">Cost</div>
          <div className="text-right">Rate</div>
          <div>Actions</div>
        </div>

        {/* Table Body */}
        <div>
          {items.map(item => {
            const badge = stockBadge(item.gross_stock_level);
            return (
              <div
                key={item.id}
                className="grid grid-cols-1 lg:grid-cols-[minmax(200px,2fr)_minmax(80px,1fr)_minmax(100px,1fr)_70px_80px_80px_140px] gap-3 px-4 py-2.5 border-b border-gray-700/40 hover:bg-white/[0.02] transition-colors items-center group cursor-pointer"
                onClick={() => {
                  setSelectedProduct(item);
                  setShowDetailsModal(true);
                }}
              >
                {/* Product: image + name + SKU */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#0f1419] border border-gray-700/60 flex items-center justify-center overflow-hidden shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Image size={14} className="text-gray-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate group-hover:text-brand-300 transition-colors">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{item.sku}</div>
                  </div>
                </div>

                {/* Brand */}
                <div className="hidden lg:block text-[13px] text-gray-300 truncate">
                  {item.brand}
                </div>

                {/* Category */}
                <div className="hidden lg:block text-[12px] text-gray-500 truncate">
                  {item.category || '-'}
                </div>

                {/* Stock */}
                <div className="hidden lg:flex items-center justify-end gap-1.5">
                  <span className={cn('text-[13px] font-medium tabular-nums', stockColor(item.gross_stock_level))}>
                    {item.gross_stock_level}
                  </span>
                </div>

                {/* Cost */}
                <div className="hidden lg:block text-[13px] text-gray-400 text-right tabular-nums">
                  {formatCurrency(item.cost_price)}
                </div>

                {/* Rate (selling price) */}
                <div className="hidden lg:block text-[13px] font-medium text-white text-right tabular-nums">
                  {formatCurrency(item.rate)}
                </div>

                {/* Actions */}
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setSelectedProduct(item); setShowDetailsModal(true); }}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-brand-300/80 border border-brand-300/25 bg-brand-300/5 rounded-md hover:text-brand-300 hover:border-brand-300/40 hover:bg-brand-300/10 transition-all"
                    title="View Details"
                  >
                    <Eye size={11} /> View
                  </button>
                  <button
                    onClick={() => { setSelectedProduct(item); setShowEditModal(true); }}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-amber-400/80 border border-amber-400/25 bg-amber-400/5 rounded-md hover:text-amber-400 hover:border-amber-400/40 hover:bg-amber-400/10 transition-all"
                    title="Edit"
                  >
                    <Edit2 size={11} /> Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(item.id)}
                    className="inline-flex items-center p-1.5 text-[11px] text-red-400/60 border border-red-400/15 bg-red-400/5 rounded-md hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-all"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
            <span className="text-sm text-gray-500">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 text-gray-400 border border-gray-700 rounded-md hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-300 font-medium px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-gray-400 border border-gray-700 rounded-md hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showDetailsModal && selectedProduct && (() => {
        const originalProduct = rawProducts.find(p => String(p.id) === selectedProduct.id);
        return originalProduct ? (
          <ProductDetailsModal
            product={originalProduct}
            onClose={() => { setShowDetailsModal(false); setSelectedProduct(null); }}
          />
        ) : null;
      })()}

      {showEditModal && selectedProduct && (
        <EditProductModal
          product={selectedProduct}
          brands={brands}
          onClose={() => { setShowEditModal(false); setSelectedProduct(null); }}
          onUpdate={() => { loadItems(currentPage, false); setShowEditModal(false); setSelectedProduct(null); }}
        />
      )}

      {showAddModal && (
        <AddProductModal
          brands={brands}
          onClose={() => setShowAddModal(false)}
          onAdd={() => { loadItems(1, false); setShowAddModal(false); }}
        />
      )}

      {showAIEnrichModal && (
        <AIProductEnricher
          companyId="dm-brands"
          onClose={() => setShowAIEnrichModal(false)}
          onComplete={() => { loadItems(currentPage, false); setShowAIEnrichModal(false); }}
        />
      )}

      {showPricelistUpload && (
        <PricelistUpload
          onClose={() => { setShowPricelistUpload(false); loadItems(currentPage, false); }}
        />
      )}
    </div>
  );
};

export default InventoryProducts;
