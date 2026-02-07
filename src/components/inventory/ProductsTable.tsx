import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Upload } from "lucide-react";
import { productService } from "@/services/productService";
import type { Product } from "@/types/domain";
import { useDataTable } from "@/hooks/use-data-table";
import { getProductColumns } from "./products-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ProductDetailSheet } from "@/components/InventoryManagement/ProductDetailSheet";
import { AIProductEnricher } from "@/components/AIProductEnricher";
import PricelistUploadSheet from "@/components/InventoryManagement/PricelistUpload";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

interface StockCounts {
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
}

export default function ProductsTable() {
  usePageTitle("Products");

  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stockCounts, setStockCounts] = useState<StockCounts | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAIEnrichModal, setShowAIEnrichModal] = useState(false);
  const [showPricelistUpload, setShowPricelistUpload] = useState(false);
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [brandOptions, setBrandOptions] = useState<
    { label: string; value: string; count?: number }[]
  >([]);

  // Fetch brand options on mount
  useEffect(() => {
    async function fetchBrands() {
      try {
        const brandsData = await productService.getBrands();
        setBrands(brandsData);
        setBrandOptions(
          brandsData
            .filter((b) => b.brand && b.brand !== "nan" && b.brand !== "")
            .map((b) => ({
              label: b.brand,
              value: b.brand,
              count: Number(b.count),
            }))
        );
      } catch (err) {
        console.error("Failed to fetch brands:", err);
      }
    }
    fetchBrands();
  }, []);

  const columns = useMemo(
    () => getProductColumns(brandOptions),
    [brandOptions]
  );

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: products,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "name" as keyof Product, desc: false }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
      columnFilters: [{ id: "status", value: ["active"] }],
    },
  });

  const pagination = table.getState().pagination;
  const sorting = table.getState().sorting;
  const columnFilters = table.getState().columnFilters;

  const sortColumnMap: Record<string, string> = {
    search: "name",
    brand: "brand",
    stock_on_hand: "stock_on_hand",
    rate: "rate",
    cost_price: "cost_price",
    status: "name", // fallback
  };

  const apiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    };

    if (sorting.length > 0) {
      filters.sort_by = sortColumnMap[sorting[0].id] || "name";
      filters.sort_order = sorting[0].desc ? "desc" : "asc";
    }

    for (const filter of columnFilters) {
      const value = filter.value;
      if (filter.id === "search" && typeof value === "string" && value) {
        filters.search = value;
      } else if (filter.id === "search" && Array.isArray(value) && value.length) {
        filters.search = value[0];
      } else if (filter.id === "brand" && Array.isArray(value) && value.length) {
        filters.brand = value.join(",");
      } else if (filter.id === "stock_on_hand" && Array.isArray(value) && value.length) {
        filters.stock_filter = value[0];
      } else if (filter.id === "status" && Array.isArray(value) && value.length) {
        filters.status = value[0];
      }
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      setLoading(true);
      try {
        const [result, counts] = await Promise.all([
          productService.list(apiFilters),
          productService.stockCounts({
            status: apiFilters.status as string | undefined,
            brand: apiFilters.brand as string | undefined,
            search: apiFilters.search as string | undefined,
          }),
        ]);
        if (cancelled) return;
        setProducts(result.data);
        setTotalCount(result.meta?.total ?? result.count);
        setStockCounts(counts);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch products:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProducts();
    return () => { cancelled = true; };
  }, [apiFilters, refreshKey]);

  const handleProductUpdated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleRowClick = useCallback(
    (row: Product) => {
      setSelectedProduct(row);
      setSheetOpen(true);
    },
    []
  );

  const stockSummary = stockCounts && (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
        In Stock: {stockCounts.in_stock}
      </span>
      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-400">
        Low: {stockCounts.low_stock}
      </span>
      <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-400">
        Out: {stockCounts.out_of_stock}
      </span>
    </div>
  );

  if (loading && products.length === 0) {
    return (
      <div>
        <PageHeader title="Products" count={0} subtitle="products" />
        <DataTableSkeleton
          columnCount={8}
          rowCount={10}
          filterCount={4}
          cellWidths={["40px", "280px", "140px", "80px", "90px", "90px", "100px", "90px"]}
        />
      </div>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      {stockSummary}
      <div className="w-px h-5 bg-border/50 mx-1" />
      <Button intent="outline" size="sm" onPress={() => setShowPricelistUpload(true)}>
        <Upload size={12} className="mr-1.5" /> Pricelists
      </Button>
      <Button intent="outline" size="sm" onPress={() => setShowAIEnrichModal(true)}>
        <Sparkles size={12} className="mr-1.5" /> AI Enhance
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader title="Products" count={totalCount} subtitle="products" actions={headerActions} />
      <DataTable table={table} onRowClick={handleRowClick}>
        <DataTableToolbar table={table} />
      </DataTable>

      <ProductDetailSheet
        product={selectedProduct}
        brands={brands}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedProduct(null);
        }}
        onUpdated={handleProductUpdated}
      />

      <AIProductEnricher
        companyId="dm-brands"
        open={showAIEnrichModal}
        onOpenChange={setShowAIEnrichModal}
        onComplete={handleProductUpdated}
      />

      <PricelistUploadSheet
        open={showPricelistUpload}
        onOpenChange={setShowPricelistUpload}
        onApplied={handleProductUpdated}
      />
    </div>
  );
}
