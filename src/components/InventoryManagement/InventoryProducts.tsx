import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageHeader from '@/components/shared/PageHeader';
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
  LayoutList,
  LayoutGrid,
  Rows3,
  X,
  Copy,
  Pencil,
  Trash2,
  TrendingUp,
  AlertTriangle,
  PackageX,
  Command,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { productService } from '../../services/productService';
import { useLoader } from '../../contexts/LoaderContext';
import AddProductSheet from './AddProductModal';
import { ProductDetailSheet } from './ProductDetailSheet';
import { AIProductEnricher } from '../AIProductEnricher';
import PricelistUploadSheet from './PricelistUpload';
import { CommandPalette } from './CommandPalette';
import type { Product } from '../../types/domain';
import { cn } from '@/lib/utils';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { flexRender } from '@tanstack/react-table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ITEMS_PER_PAGE = 50;

type DensityMode = 'compact' | 'comfortable' | 'spacious';

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
  margin?: number;
  status: string;
  image_url?: string;
  has_image: boolean;
  created_date: string;
}

const mapProductToInventoryItem = (product: Product): InventoryItem => {
  const cost = product.cost_price ?? 0;
  const rate = product.rate ?? 0;
  const margin = cost > 0 ? ((rate - cost) / cost) * 100 : undefined;

  return {
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
    margin: margin ? Math.round(margin) : undefined,
    status: product.status,
    image_url: product.image_url || undefined,
    has_image: !!product.image_url,
    created_date: product.created_at,
  };
};

const formatCurrency = (value?: number) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
};

const stockColor = (level: number) => {
  if (level === 0) return 'text-red-400';
  if (level <= 5) return 'text-amber-400';
  return 'text-emerald-400';
};

const marginColor = (margin?: number) => {
  if (margin === undefined) return 'text-muted-foreground';
  if (margin >= 40) return 'text-emerald-400';
  if (margin >= 20) return 'text-foreground';
  if (margin >= 0) return 'text-amber-400';
  return 'text-red-400';
};

const marginBarWidth = (margin?: number) => {
  if (margin === undefined) return 0;
  return Math.min(Math.max(margin, 0), 100);
};

const marginBarColor = (margin?: number) => {
  if (margin === undefined) return 'bg-muted';
  if (margin >= 40) return 'bg-emerald-500/60';
  if (margin >= 20) return 'bg-primary/50';
  if (margin >= 0) return 'bg-amber-500/50';
  return 'bg-red-500/50';
};

// Stock summary chip component
function StockChip({
  label,
  count,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200',
        active
          ? `${color} border-current/30 bg-current/10`
          : 'text-muted-foreground border-border/50 hover:border-border bg-card/50 hover:bg-card'
      )}
    >
      <Icon size={13} />
      <span>{label}</span>
      <span className={cn(
        'tabular-nums font-semibold',
        active ? '' : 'text-foreground/70'
      )}>
        {count.toLocaleString()}
      </span>
    </motion.button>
  );
}

// Density toggle button group
function DensityToggle({
  density,
  onChange,
}: {
  density: DensityMode;
  onChange: (d: DensityMode) => void;
}) {
  const options: { value: DensityMode; icon: React.ElementType; label: string }[] = [
    { value: 'compact', icon: Rows3, label: 'Compact' },
    { value: 'comfortable', icon: LayoutList, label: 'Comfortable' },
    { value: 'spacious', icon: LayoutGrid, label: 'Spacious' },
  ];

  return (
    <div className="flex items-center rounded-lg border border-border/60 bg-card/50 p-0.5">
      {options.map((opt) => (
        <Tooltip key={opt.value}>
          <TooltipTrigger
            aria-label={opt.label}
            className={cn(
              'p-1.5 rounded-md transition-all duration-200',
              density === opt.value
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            onPress={() => onChange(opt.value)}
          >
            <opt.icon size={14} />
          </TooltipTrigger>
          <TooltipContent>{opt.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// Active filter chip
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-xs text-primary font-medium"
    >
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 hover:bg-primary/20 rounded p-0.5 transition-colors"
      >
        <X size={10} />
      </button>
    </motion.span>
  );
}

// Row hover actions overlay
function RowActions({
  item,
  onEdit,
  onCopy,
  onDelete,
}: {
  item: InventoryItem;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="flex items-center gap-0.5"
    >
      <Tooltip>
        <TooltipTrigger
          aria-label="Edit"
          className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
          onPress={onEdit}
        >
          <Pencil size={13} />
        </TooltipTrigger>
        <TooltipContent>Edit product</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          aria-label="Copy SKU"
          className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
          onPress={onCopy}
        >
          <Copy size={13} />
        </TooltipTrigger>
        <TooltipContent>Copy SKU</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          aria-label="Delete"
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          onPress={onDelete}
        >
          <Trash2 size={13} />
        </TooltipTrigger>
        <TooltipContent>Delete product</TooltipContent>
      </Tooltip>
    </motion.div>
  );
}


const InventoryProducts: React.FC = () => {
  usePageTitle('Inventory');
  const [searchParams, setSearchParams] = useSearchParams();
  const { showLoader, hideLoader } = useLoader();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [stockCounts, setStockCounts] = useState({ inStock: 0, lowStock: 0, outOfStock: 0 });

  // UI state
  const [density, setDensity] = useState<DensityMode>('comfortable');
  const [showImages, setShowImages] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
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
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Density-specific styling
  const densityConfig = useMemo(() => {
    switch (density) {
      case 'compact':
        return { rowPadding: 'py-1', textSize: 'text-xs', imageSize: 'w-6 h-6', showSku: false };
      case 'comfortable':
        return { rowPadding: 'py-2', textSize: 'text-sm', imageSize: 'w-8 h-8', showSku: true };
      case 'spacious':
        return { rowPadding: 'py-3', textSize: 'text-sm', imageSize: 'w-10 h-10', showSku: true };
    }
  }, [density]);

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
            <div className="flex items-center gap-2.5 min-w-0">
              {showImages && (
                <div className={cn(
                  'rounded-md bg-muted/50 border border-border/50 flex items-center justify-center overflow-hidden shrink-0 transition-all duration-200',
                  densityConfig.imageSize
                )}>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Image size={density === 'compact' ? 10 : 12} className="text-muted-foreground/40" />
                  )}
                </div>
              )}
              <div className="min-w-0">
                <div className={cn(
                  'font-medium text-foreground truncate max-w-[280px]',
                  densityConfig.textSize
                )}>
                  {item.name}
                </div>
                {densityConfig.showSku && (
                  <div className="text-[11px] text-muted-foreground/60 font-mono truncate">{item.sku}</div>
                )}
              </div>
            </div>
          );
        },
        enableSorting: true,
        size: 320,
      },
      {
        accessorKey: 'brand',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Brand" />
        ),
        cell: ({ row }) => (
          <span className={cn(
            'text-foreground/70 truncate block max-w-[140px]',
            density === 'compact' ? 'text-xs' : 'text-[13px]'
          )}>
            {row.original.brand}
          </span>
        ),
        enableSorting: true,
        size: 140,
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Category" />
        ),
        cell: ({ row }) => {
          const cat = row.original.category;
          if (!cat || cat === '-') return <span className="text-muted-foreground/30 text-xs">—</span>;
          return (
            <span className={cn(
              'text-muted-foreground truncate block max-w-[120px]',
              density === 'compact' ? 'text-xs' : 'text-xs'
            )}>
              {cat}
            </span>
          );
        },
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
          return (
            <div className="text-right">
              <span className={cn(
                'font-semibold tabular-nums',
                stockColor(level),
                density === 'compact' ? 'text-xs' : 'text-[13px]'
              )}>
                {level.toLocaleString()}
              </span>
            </div>
          );
        },
        enableSorting: true,
        size: 70,
      },
      {
        accessorKey: 'cost_price',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Cost" className="justify-end" />
        ),
        cell: ({ row }) => (
          <span className={cn(
            'text-muted-foreground tabular-nums text-right block',
            density === 'compact' ? 'text-xs' : 'text-[13px]'
          )}>
            {formatCurrency(row.original.cost_price)}
          </span>
        ),
        enableSorting: true,
        size: 85,
      },
      {
        accessorKey: 'rate',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Rate" className="justify-end" />
        ),
        cell: ({ row }) => (
          <span className={cn(
            'font-medium text-foreground tabular-nums text-right block',
            density === 'compact' ? 'text-xs' : 'text-[13px]'
          )}>
            {formatCurrency(row.original.rate)}
          </span>
        ),
        enableSorting: true,
        size: 85,
      },
      {
        accessorKey: 'margin',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Margin" className="justify-end" />
        ),
        cell: ({ row }) => {
          const m = row.original.margin;
          return (
            <div className="flex items-center justify-end gap-2">
              <div className="w-12 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <motion.div
                  className={cn('h-full rounded-full', marginBarColor(m))}
                  initial={{ width: 0 }}
                  animate={{ width: `${marginBarWidth(m)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <span className={cn(
                'tabular-nums font-medium min-w-[32px] text-right',
                marginColor(m),
                density === 'compact' ? 'text-xs' : 'text-[13px]'
              )}>
                {m !== undefined ? `${m}%` : '—'}
              </span>
            </div>
          );
        },
        enableSorting: true,
        size: 110,
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => {
          const item = row.original;
          const isHovered = hoveredRow === item.id;
          return (
            <div className="w-[80px] flex justify-end">
              <AnimatePresence>
                {isHovered && (
                  <RowActions
                    item={item}
                    onEdit={() => handleRowClick(item)}
                    onCopy={() => navigator.clipboard.writeText(item.sku)}
                    onDelete={() => handleDeleteProduct(item)}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        },
        size: 80,
      },
    ],
    [density, densityConfig, hoveredRow, showImages]
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

      // Build shared filter set
      const baseFilters: Record<string, string> = { status: 'active' };
      if (filters.brand) baseFilters.brand = filters.brand;
      if (filters.search) baseFilters.search = filters.search;

      // API filters include stock_filter + pagination
      const apiFilters: Record<string, string | number> = {
        ...baseFilters,
        limit: pagination.pageSize,
        offset: (page - 1) * pagination.pageSize,
      };
      if (filters.stockFilter) apiFilters.stock_filter = filters.stockFilter;

      // Count filters also include stock_filter so total matches
      const countFilters: Record<string, string> = { ...baseFilters };
      if (filters.stockFilter) countFilters.stock_filter = filters.stockFilter;

      // Fetch data, filtered count, and global stock breakdown in parallel
      const [response, totalCount, stockCountsData] = await Promise.all([
        productService.list(apiFilters),
        productService.count(countFilters),
        productService.stockCounts(baseFilters),
      ]);

      if (response.data) {
        setRawProducts(response.data);
        const mappedItems = response.data.map(mapProductToInventoryItem);

        // Stock counts come from the dedicated endpoint — accurate across entire dataset
        setStockCounts({
          inStock: stockCountsData.in_stock,
          lowStock: stockCountsData.low_stock,
          outOfStock: stockCountsData.out_of_stock,
        });

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

  useEffect(() => {
    const init = async () => {
      showLoader('Loading Inventory...');
      await fetchBrands();
    };
    init();
  }, [fetchBrands, showLoader]);

  useEffect(() => {
    loadItems(pagination.pageIndex + 1, items.length === 0);
  }, [filters, pagination.pageIndex, pagination.pageSize]);

  // Keyboard navigation: Cmd+K for search focus, arrow keys for rows
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K to open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }

      // Only handle arrow keys when not in an input
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur();
          setFocusedRowIndex(0);
        }
        return;
      }

      const rows = table.getRowModel().rows;
      if (rows.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIndex((prev) => Math.min(prev + 1, rows.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusedRowIndex >= 0) {
        e.preventDefault();
        handleRowClick(rows[focusedRowIndex].original);
      } else if (e.key === 'Escape') {
        setFocusedRowIndex(-1);
        setSheetOpen(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedRowIndex, table]);

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

  const handleRowClick = (item: InventoryItem) => {
    const rawProduct = rawProducts.find((p) => String(p.id) === item.id);
    if (rawProduct) {
      setSelectedProduct(rawProduct);
      setSheetOpen(true);
    }
  };

  const handleCommandSelect = useCallback((product: Product) => {
    setSelectedProduct(product);
    setSheetOpen(true);
  }, []);

  const handleDeleteProduct = async (item: InventoryItem) => {
    // Will be handled by the detail sheet's delete confirmation
    const rawProduct = rawProducts.find((p) => String(p.id) === item.id);
    if (rawProduct) {
      setSelectedProduct(rawProduct);
      setSheetOpen(true);
    }
  };

  const hasActiveFilters = filters.brand || filters.stockFilter || filters.search;

  // Loading skeleton
  if (loading && items.length === 0 && !error) {
    return (
      <div className="min-h-screen p-6">
        <div className="bg-card rounded-xl border border-border overflow-hidden p-4">
          <DataTableSkeleton
            columnCount={7}
            rowCount={15}
            withViewOptions={false}
            withPagination
          />
        </div>
      </div>
    );
  }

  // Empty state
  if (!loading && items.length === 0 && !error && !hasActiveFilters) {
    return (
      <div className="min-h-screen p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
              <Package2 size={28} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No products yet</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
              Get started by adding your first product or uploading a pricelist
            </p>
            <div className="flex gap-3">
              <Button intent="outline" size="sm" onPress={() => setShowPricelistUpload(true)}>
                <Upload size={14} className="mr-1.5" /> Upload Pricelist
              </Button>
              <Button intent="primary" size="sm" onPress={() => setShowAddModal(true)}>
                <Plus size={16} className="mr-1.5" /> Add Product
              </Button>
            </div>
          </div>
        </motion.div>

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
          onComplete={() => loadItems(pagination.pageIndex + 1, false)}
        />
      </div>
    );
  }

  const totalPages = Math.ceil(totalItems / pagination.pageSize);

  return (
    <div className="min-h-screen p-6 space-y-3">
      <PageHeader
        title="Inventory"
        count={totalItems}
        subtitle="products"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Left: Search + Filters */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 w-4 h-4" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="pl-9 pr-16"
            />
            <button
              type="button"
              onClick={() => setShowCommandPalette(true)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 text-[10px] text-muted-foreground font-mono hover:bg-muted hover:border-primary/30 transition-colors cursor-pointer"
              title="Open command palette"
            >
              <Command size={9} />K
            </button>
          </div>

          <Select
            value={filters.brand || 'all'}
            onValueChange={(val) => handleFilterChange('brand', val === 'all' ? '' : val)}
          >
            <SelectTrigger className="w-[150px]">
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
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-border/50" />

        {/* Right: View controls + Actions */}
        <div className="flex items-center gap-2">
          <DensityToggle density={density} onChange={setDensity} />

          <Tooltip>
            <TooltipTrigger
              aria-label="Toggle images"
              className={cn(
                'p-1.5 rounded-lg border transition-all duration-200',
                showImages
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted/50'
              )}
              onPress={() => setShowImages(!showImages)}
            >
              <Image size={14} />
            </TooltipTrigger>
            <TooltipContent>{showImages ? 'Hide images' : 'Show images'}</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border/50" />

          <Button intent="outline" size="sm" onPress={() => setShowPricelistUpload(true)}>
            <Upload size={14} className="mr-1.5" /> Pricelists
          </Button>
          <Button intent="outline" size="sm" onPress={() => setShowAIEnrichModal(true)}>
            <Sparkles size={14} className="mr-1.5" /> AI Enhance
          </Button>
          <Button intent="primary" size="sm" onPress={() => setShowAddModal(true)}>
            <Plus size={16} className="mr-1.5" /> Add Product
          </Button>
        </div>
      </div>

      {/* Stock summary chips + Active filters */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StockChip
            label="In Stock"
            count={stockCounts.inStock}
            icon={TrendingUp}
            color="text-emerald-400"
            active={filters.stockFilter === 'in-stock'}
            onClick={() =>
              handleFilterChange('stockFilter', filters.stockFilter === 'in-stock' ? '' : 'in-stock')
            }
          />
          <StockChip
            label="Low"
            count={stockCounts.lowStock}
            icon={AlertTriangle}
            color="text-amber-400"
            active={filters.stockFilter === 'low-stock'}
            onClick={() =>
              handleFilterChange('stockFilter', filters.stockFilter === 'low-stock' ? '' : 'low-stock')
            }
          />
          <StockChip
            label="Out"
            count={stockCounts.outOfStock}
            icon={PackageX}
            color="text-red-400"
            active={filters.stockFilter === 'out-of-stock'}
            onClick={() =>
              handleFilterChange(
                'stockFilter',
                filters.stockFilter === 'out-of-stock' ? '' : 'out-of-stock'
              )
            }
          />
        </div>

        <div className="flex items-center gap-2">
          <AnimatePresence>
            {filters.brand && (
              <FilterChip
                label={`Brand: ${filters.brand}`}
                onRemove={() => handleFilterChange('brand', '')}
              />
            )}
            {filters.search && (
              <FilterChip
                label={`"${filters.search}"`}
                onRemove={() => handleFilterChange('search', '')}
              />
            )}
          </AnimatePresence>
          <span className="text-xs text-muted-foreground/60 tabular-nums">
            {totalItems.toLocaleString()} product{totalItems !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[13px] text-destructive"
          >
            <AlertTriangle size={14} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="overflow-hidden rounded-xl border border-border/60 bg-card"
      >
        <Table className="bg-card">
          <TableHeader className="bg-secondary/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-border/60 bg-secondary/50 hover:bg-secondary/50"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="bg-card">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onMouseEnter={() => setHoveredRow(row.original.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => handleRowClick(row.original)}
                  className={cn(
                    'border-b border-border/30 bg-card cursor-pointer transition-all duration-150',
                    'hover:bg-primary/[0.03]',
                    focusedRowIndex === idx && 'bg-primary/[0.06] ring-1 ring-inset ring-primary/20',
                    hoveredRow === row.original.id && 'border-l-2 border-l-primary/40'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(densityConfig.rowPadding)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="bg-card">
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Search size={20} className="opacity-30" />
                    <span className="text-sm">No products match your filters</span>
                    {hasActiveFilters && (
                      <button
                        onClick={() => {
                          handleFilterChange('search', '');
                          handleFilterChange('brand', '');
                          handleFilterChange('stockFilter', '');
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground/60 tabular-nums">
              {(pagination.pageIndex * pagination.pageSize + 1).toLocaleString()}–
              {Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalItems).toLocaleString()} of{' '}
              {totalItems.toLocaleString()}
            </span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(val) => {
                setPagination((prev) => ({ ...prev, pageSize: Number(val), pageIndex: 0 }));
              }}
            >
              <SelectTrigger className="h-7 w-[70px] text-xs text-muted-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {[25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}/pg
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            {(() => {
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
                  <span key={`ellipsis-${idx}`} className="px-1.5 text-muted-foreground/40 text-xs">
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
              isDisabled={pagination.pageIndex >= totalPages - 1}
            >
              ›
            </Button>
            <Button
              intent="outline"
              size="sq-xs"
              onPress={() => handlePageChange(totalPages)}
              isDisabled={pagination.pageIndex >= totalPages - 1}
            >
              »
            </Button>
          </div>
        </div>
      )}

      {/* Sheets / Modals */}
      <ProductDetailSheet
        product={selectedProduct}
        brands={brands}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedProduct(null);
        }}
        onUpdated={() => loadItems(pagination.pageIndex + 1, false)}
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
        onComplete={() => loadItems(pagination.pageIndex + 1, false)}
      />

      <PricelistUploadSheet
        open={showPricelistUpload}
        onOpenChange={setShowPricelistUpload}
        onApplied={() => loadItems(pagination.pageIndex + 1, false)}
      />

      <CommandPalette
        open={showCommandPalette}
        onOpenChange={setShowCommandPalette}
        onSelectProduct={handleCommandSelect}
      />
    </div>
  );
};

export default InventoryProducts;
