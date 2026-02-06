import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
} from '@tanstack/react-table';
import {
  Package2,
  Search,
  Plus,
  Image,
  Sparkles,
  Upload,
} from 'lucide-react';
import { productService } from '../../services/productService';
import { useLoader } from '../../contexts/LoaderContext';
import AddProductSheet from './AddProductModal';
import { ProductDetailSheet } from './ProductDetailSheet';
import { AIProductEnricher } from '../AIProductEnricher';
import PricelistUploadSheet from './PricelistUpload';
import type { Product } from '../../types/domain';
import { cn } from '@/lib/utils';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ITEMS_PER_PAGE = 25;

// Internal inventory item interface for UI display
interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  ean?: string;
  description?: string;
  category?: string;
  brand: string;
  gross_stock_level: number;
  reorder_level: number;
  cost_price?: number;
  rate?: number;
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
  cost_price: product.cost_price ?? undefined,
  rate: product.rate ?? undefined,
  status: product.status,
  image_url: product.image_url || undefined,
  created_date: product.created_at,
});

const formatCurrency = (value?: number) => {
  if (value === undefined || value === null) return '---';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
};

const stockColor = (level: number) => {
  if (level === 0) return 'text-destructive';
  if (level <= 5) return 'text-warning';
  return 'text-success';
};

const stockBadge = (level: number) => {
  if (level === 0) return { label: 'Out', cls: 'bg-destructive/10 text-destructive border-destructive/20' };
  if (level <= 5) return { label: 'Low', cls: 'bg-warning/10 text-warning border-warning/20' };
  return { label: 'In Stock', cls: 'bg-success/10 text-success border-success/20' };
};

const InventoryProducts: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showLoader, hideLoader } = useLoader();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [totalItems, setTotalItems] = useState(0);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'gross_stock_level', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ITEMS_PER_PAGE,
  });

  // Filters synced with URL
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    brand: searchParams.get('brand') || '',
    stockFilter: searchParams.get('filter') || '',
  });

  // Modal/sheet states
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIEnrichModal, setShowAIEnrichModal] = useState(false);
  const [showPricelistUpload, setShowPricelistUpload] = useState(false);

  // Column definitions
  const columns = useMemo<ColumnDef<InventoryItem>[]>(
    () => [
      {
        id: 'product',
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Product" />
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-background border border-border flex items-center justify-center overflow-hidden shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <Image size={14} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate max-w-[200px]">
                  {item.name}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{item.sku}</div>
              </div>
            </div>
          );
        },
        enableSorting: true,
        size: 280,
      },
      {
        accessorKey: 'brand',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Brand" />
        ),
        cell: ({ row }) => (
          <span className="text-[13px] text-foreground/80 truncate block max-w-[100px]">
            {row.original.brand}
          </span>
        ),
        enableSorting: true,
        size: 120,
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Category" />
        ),
        cell: ({ row }) => (
          <span className="text-[12px] text-muted-foreground truncate block max-w-[120px]">
            {row.original.category || '-'}
          </span>
        ),
        enableSorting: true,
        size: 130,
      },
      {
        accessorKey: 'gross_stock_level',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Stock" className="justify-end" />
        ),
        cell: ({ row }) => {
          const level = row.original.gross_stock_level;
          const badge = stockBadge(level);
          return (
            <div className="flex items-center justify-end gap-2">
              <span className={cn('text-[13px] font-medium tabular-nums', stockColor(level))}>
                {level}
              </span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', badge.cls)}>
                {badge.label}
              </span>
            </div>
          );
        },
        enableSorting: true,
        size: 100,
      },
      {
        accessorKey: 'cost_price',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Cost" className="justify-end" />
        ),
        cell: ({ row }) => (
          <span className="text-[13px] text-muted-foreground tabular-nums text-right block">
            {formatCurrency(row.original.cost_price)}
          </span>
        ),
        enableSorting: true,
        size: 90,
      },
      {
        accessorKey: 'rate',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Rate" className="justify-end" />
        ),
        cell: ({ row }) => (
          <span className="text-[13px] font-medium text-foreground tabular-nums text-right block">
            {formatCurrency(row.original.rate)}
          </span>
        ),
        enableSorting: true,
        size: 90,
      },
    ],
    []
  );

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
        limit: pagination.pageSize,
        offset: (page - 1) * pagination.pageSize,
      };

      if (filters.brand) apiFilters.brand = filters.brand;
      if (filters.search) apiFilters.search = filters.search;
      apiFilters.status = 'active';

      const [response, totalCount] = await Promise.all([
        productService.list(apiFilters),
        productService.count(countFilters),
      ]);

      if (response.data) {
        setRawProducts(response.data);
        let mappedItems = response.data.map(mapProductToInventoryItem);

        // Client-side stock filtering
        if (filters.stockFilter === 'out-of-stock') {
          mappedItems = mappedItems.filter((item) => item.gross_stock_level === 0);
        } else if (filters.stockFilter === 'low-stock') {
          mappedItems = mappedItems.filter(
            (item) => item.reorder_level > 0 && item.gross_stock_level <= item.reorder_level
          );
        } else if (filters.stockFilter === 'in-stock') {
          mappedItems = mappedItems.filter((item) => item.gross_stock_level > 0);
        }

        setItems(mappedItems);
        setTotalItems(totalCount);
        setPagination((prev) => ({ ...prev, pageIndex: page - 1 }));
      }
    } catch (err) {
      console.error('Error loading items:', err);
      setError('Failed to load products');
    } finally {
      setLoading(false);
      if (isInitialLoad) hideLoader();
    }
  }, [filters, pagination.pageSize, showLoader, hideLoader]);

  // Table instance
  const table = useReactTable({
    data: items,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    pageCount: Math.ceil(totalItems / pagination.pageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    enableRowSelection: false,
  });

  // Load brands on mount
  useEffect(() => {
    const init = async () => {
      showLoader('Loading Inventory...');
      await fetchBrands();
    };
    init();
  }, [fetchBrands, showLoader]);

  // Load items when filters or page changes
  useEffect(() => {
    loadItems(pagination.pageIndex + 1, items.length === 0);
  }, [filters, pagination.pageIndex, pagination.pageSize]);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));

    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    setSearchParams(params);
  };

  const handlePageChange = (newPage: number) => {
    loadItems(newPage, false);
  };

  // Handle row click - find the raw Product for the sheet
  const handleRowClick = (item: InventoryItem) => {
    const rawProduct = rawProducts.find((p) => String(p.id) === item.id);
    if (rawProduct) {
      setSelectedProduct(rawProduct);
      setSheetOpen(true);
    }
  };

  // Loading skeleton
  if (loading && items.length === 0 && !error) {
    return (
      <div className="min-h-screen p-4">
        <div className="bg-card rounded-xl border border-border overflow-hidden p-4">
          <DataTableSkeleton
            columnCount={7}
            rowCount={10}
            withViewOptions={false}
            withPagination
          />
        </div>
      </div>
    );
  }

  // Empty state
  if (!loading && items.length === 0 && !error) {
    return (
      <div className="min-h-screen p-4">
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm text-muted-foreground">0 products</span>
            <div className="flex items-center gap-2">
              <Button
                intent="outline"
                size="sm"
                onPress={() => setShowAIEnrichModal(true)}
              >
                <Sparkles size={14} className="mr-1.5" /> AI Enhance
              </Button>
              <Button
                intent="primary"
                size="sm"
                onPress={() => setShowAddModal(true)}
              >
                <Plus size={16} className="mr-1.5" /> Add Product
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Package2 size={48} className="mb-4 opacity-40" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No products found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by adding your first product to the inventory
            </p>
            <Button intent="primary" onPress={() => setShowAddModal(true)}>
              <Plus size={16} className="mr-1.5" /> Add First Product
            </Button>
          </div>
        </div>

        <AddProductSheet
          brands={brands}
          open={showAddModal}
          onOpenChange={setShowAddModal}
          onAdd={() => {
            loadItems(1, false);
            setShowAddModal(false);
          }}
        />
        <AIProductEnricher
          companyId="dm-brands"
          open={showAIEnrichModal}
          onOpenChange={setShowAIEnrichModal}
          onComplete={() => {
            loadItems(pagination.pageIndex + 1, false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <DataTable table={table} onRowClick={handleRowClick}>
        {/* Custom Toolbar */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search by name or SKU..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Brand filter */}
          <Select
            value={filters.brand || 'all'}
            onValueChange={(val) => handleFilterChange('brand', val === 'all' ? '' : val)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.brand} value={b.brand}>
                  {b.brand} ({b.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stock filter */}
          <Select
            value={filters.stockFilter || 'all'}
            onValueChange={(val) => handleFilterChange('stockFilter', val === 'all' ? '' : val)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="in-stock">In Stock</SelectItem>
              <SelectItem value="low-stock">Low Stock</SelectItem>
              <SelectItem value="out-of-stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>

          {/* Actions */}
          <Button
            intent="outline"
            size="sm"
            onPress={() => setShowPricelistUpload(true)}
          >
            <Upload size={14} className="mr-1.5" /> Pricelists
          </Button>
          <Button
            intent="outline"
            size="sm"
            onPress={() => setShowAIEnrichModal(true)}
          >
            <Sparkles size={14} className="mr-1.5" /> AI Enhance
          </Button>
          <Button
            intent="primary"
            size="sm"
            onPress={() => setShowAddModal(true)}
          >
            <Plus size={16} className="mr-1.5" /> Add Product
          </Button>
        </div>

        {/* Results count */}
        <div className="text-xs text-muted-foreground mb-2">
          {totalItems} product{totalItems !== 1 ? 's' : ''}
          {filters.search && ` matching "${filters.search}"`}
          {filters.brand && ` in ${filters.brand}`}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-[13px] text-destructive mb-4">
            {error}
          </div>
        )}
      </DataTable>

      {/* Custom pagination with page numbers */}
      {Math.ceil(totalItems / pagination.pageSize) > 1 && (
        <div className="flex items-center justify-between px-1 py-3 mt-2">
          <span className="text-sm text-muted-foreground">
            {pagination.pageIndex * pagination.pageSize + 1}–
            {Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalItems)} of {totalItems}
          </span>
          <div className="flex items-center gap-1">
            <Button
              intent="outline"
              size="sq-xs"
              onPress={() => handlePageChange(1)}
              isDisabled={pagination.pageIndex === 0}
            >
              «
            </Button>
            <Button
              intent="outline"
              size="sq-xs"
              onPress={() => handlePageChange(pagination.pageIndex)}
              isDisabled={pagination.pageIndex === 0}
            >
              ‹
            </Button>
            {/* Page numbers */}
            {(() => {
              const totalPages = Math.ceil(totalItems / pagination.pageSize);
              const currentPage = pagination.pageIndex + 1;
              const pages: (number | string)[] = [];

              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (currentPage > 3) pages.push('...');
                for (
                  let i = Math.max(2, currentPage - 1);
                  i <= Math.min(totalPages - 1, currentPage + 1);
                  i++
                ) {
                  pages.push(i);
                }
                if (currentPage < totalPages - 2) pages.push('...');
                pages.push(totalPages);
              }

              return pages.map((p, idx) =>
                typeof p === 'string' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                    {p}
                  </span>
                ) : (
                  <Button
                    key={p}
                    intent={p === currentPage ? 'primary' : 'outline'}
                    size="sq-xs"
                    onPress={() => handlePageChange(p)}
                  >
                    {p}
                  </Button>
                )
              );
            })()}
            <Button
              intent="outline"
              size="sq-xs"
              onPress={() => handlePageChange(pagination.pageIndex + 2)}
              isDisabled={pagination.pageIndex >= Math.ceil(totalItems / pagination.pageSize) - 1}
            >
              ›
            </Button>
            <Button
              intent="outline"
              size="sq-xs"
              onPress={() => handlePageChange(Math.ceil(totalItems / pagination.pageSize))}
              isDisabled={pagination.pageIndex >= Math.ceil(totalItems / pagination.pageSize) - 1}
            >
              »
            </Button>
          </div>
        </div>
      )}

      {/* Product Detail Sheet */}
      <ProductDetailSheet
        product={selectedProduct}
        brands={brands}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedProduct(null);
        }}
        onUpdated={() => {
          loadItems(pagination.pageIndex + 1, false);
        }}
      />

      <AddProductSheet
        brands={brands}
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onAdd={() => {
          loadItems(1, false);
          setShowAddModal(false);
        }}
      />

      <AIProductEnricher
        companyId="dm-brands"
        open={showAIEnrichModal}
        onOpenChange={setShowAIEnrichModal}
        onComplete={() => {
          loadItems(pagination.pageIndex + 1, false);
        }}
      />

      <PricelistUploadSheet
        open={showPricelistUpload}
        onOpenChange={setShowPricelistUpload}
        onApplied={() => {
          loadItems(pagination.pageIndex + 1, false);
        }}
      />
    </div>
  );
};

export default InventoryProducts;
