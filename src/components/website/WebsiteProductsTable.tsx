import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Layers, Sparkles } from "lucide-react";
import { websiteProductService } from "@/services/websiteProductService";
import type { WebsiteProduct, WebsiteCategory } from "@/types/domain";
import { useDataTable } from "@/hooks/use-data-table";
import { getWebsiteProductColumns } from "./website-products-columns";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { WebsiteProductDetailSheet } from "./WebsiteProductDetailSheet";
import { AddWebsiteProductSheet } from "./AddWebsiteProductSheet";
import { BatchAddWebsiteProductSheet } from "./BatchAddWebsiteProductSheet";
import { BatchEnhanceSheet } from "./BatchEnhanceSheet";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

export default function WebsiteProductsTable() {
  usePageTitle("Website Products");

  const [products, setProducts] = useState<WebsiteProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<WebsiteProduct | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [enhanceSheetOpen, setEnhanceSheetOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [brandOptions, setBrandOptions] = useState<{ label: string; value: string; count?: number }[]>([]);
  const [categories, setCategories] = useState<WebsiteCategory[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);

  // Fetch brand + category options on mount
  useEffect(() => {
    async function fetchOptions() {
      try {
        const [brandsData, categoriesData] = await Promise.all([
          websiteProductService.getBrands(),
          websiteProductService.getCategories(),
        ]);
        setBrandOptions(
          brandsData
            .filter((b) => b.brand && b.brand !== "nan" && b.brand !== "")
            .map((b) => ({ label: b.brand, value: b.brand, count: Number(b.count) }))
        );
        setCategories(categoriesData);
        setCategoryOptions(
          categoriesData.map((c) => ({ label: c.name, value: c.name }))
        );
      } catch (err) {
        console.error("Failed to fetch filter options:", err);
      }
    }
    fetchOptions();
  }, []);

  const columns = useMemo(
    () => getWebsiteProductColumns(brandOptions, categoryOptions),
    [brandOptions, categoryOptions]
  );

  const pageCount = Math.ceil(totalCount / PAGE_SIZE);

  const { table } = useDataTable({
    columns,
    data: products,
    pageCount: pageCount > 0 ? pageCount : 1,
    initialState: {
      sorting: [{ id: "search" as keyof WebsiteProduct, desc: false }],
      pagination: { pageIndex: 0, pageSize: PAGE_SIZE },
      columnFilters: [{ id: "is_active", value: ["true"] }],
    },
  });

  const pagination = table.getState().pagination;
  const sorting = table.getState().sorting;
  const columnFilters = table.getState().columnFilters;

  const sortColumnMap: Record<string, string> = {
    search: "name",
    brand: "brand",
    retail_price: "retail_price",
    stock_on_hand: "stock_on_hand",
    is_active: "name",
    category: "category",
  };

  const apiFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    };

    if (sorting.length > 0) {
      filters.sort_by = sortColumnMap[sorting[0].id] || "display_name";
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
      } else if (filter.id === "category" && Array.isArray(value) && value.length) {
        // Find category id from name
        const cat = categories.find((c) => c.name === value[0]);
        if (cat) filters.category_id = cat.id;
      } else if (filter.id === "badge" && Array.isArray(value) && value.length) {
        filters.badge = value[0];
      } else if (filter.id === "is_featured" && Array.isArray(value) && value.length) {
        filters.is_featured = value[0];
      } else if (filter.id === "is_active" && Array.isArray(value) && value.length) {
        filters.is_active = value[0];
      }
    }

    return filters;
  }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters, categories]);

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      setLoading(true);
      try {
        const result = await websiteProductService.list(apiFilters);
        if (cancelled) return;
        setProducts(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch website products:", err);
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

  const handleRowClick = useCallback((row: WebsiteProduct) => {
    setSelectedProduct(row);
    setSheetOpen(true);
  }, []);

  if (loading && products.length === 0) {
    return (
      <div>
        <PageHeader title="Website Products" />
        <DataTableSkeleton
          columnCount={9}
          rowCount={10}
          filterCount={4}
          cellWidths={["40px", "280px", "140px", "100px", "130px", "80px", "80px", "80px", "90px"]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Website Products"
        subtitle={`${totalCount} products on Pop Home`}
        actions={
          <div className="flex items-center gap-2">
            <Button intent="outline" size="sm" onPress={() => setEnhanceSheetOpen(true)}>
              <Sparkles size={14} className="mr-1.5" /> Enhance
            </Button>
            <Button intent="outline" size="sm" onPress={() => setBatchSheetOpen(true)}>
              <Layers size={14} className="mr-1.5" /> Batch Add
            </Button>
            <Button intent="primary" size="sm" onPress={() => setAddSheetOpen(true)}>
              <Plus size={14} className="mr-1.5" /> Add Product
            </Button>
          </div>
        }
      />
      <DataTable table={table} onRowClick={handleRowClick}>
        <DataTableToolbar table={table} />
      </DataTable>

      <WebsiteProductDetailSheet
        product={selectedProduct}
        categories={categories}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedProduct(null);
        }}
        onUpdated={handleProductUpdated}
      />

      <AddWebsiteProductSheet
        categories={categories}
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onCreated={handleProductUpdated}
      />

      <BatchAddWebsiteProductSheet
        categories={categories}
        open={batchSheetOpen}
        onOpenChange={setBatchSheetOpen}
        onCreated={handleProductUpdated}
      />

      <BatchEnhanceSheet
        categories={categories}
        open={enhanceSheetOpen}
        onOpenChange={setEnhanceSheetOpen}
        onComplete={handleProductUpdated}
      />
    </div>
  );
}
