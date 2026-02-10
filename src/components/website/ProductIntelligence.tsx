import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Search,
  Loader2,
  PackageCheck,
  Globe,
  Users,
  ShoppingCart,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import { productIntelligenceService } from "@/services/productIntelligenceService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type {
  ProductPopularity,
  ReorderAlert,
  PriceCheckResult,
} from "@/types/domain";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(value);
}

const DATE_RANGES = [
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "6 months", value: "6m" },
  { label: "12 months", value: "12m" },
  { label: "All time", value: "all" },
];

// ── Popularity Tab ───────────────────────────────────────────

function PopularityTab() {
  const [data, setData] = useState<ProductPopularity[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [dateRange, setDateRange] = useState("90d");
  const [brandFilter, setBrandFilter] = useState("");
  const [websiteOnly, setWebsiteOnly] = useState(false);
  const [sortBy, setSortBy] = useState("unique_customers");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [brandOptions, setBrandOptions] = useState<
    { brand: string; product_count: number }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [priceResults, setPriceResults] = useState<PriceCheckResult[]>([]);
  const [priceChecking, setPriceChecking] = useState(false);

  const PAGE_SIZE = 50;

  useEffect(() => {
    productIntelligenceService.getBrands().then(setBrandOptions).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const filters = {
      date_range: dateRange,
      brand: brandFilter || undefined,
      min_orders: 2,
      sort_by: sortBy,
      sort_order: sortOrder,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      website_only: websiteOnly ? "true" : undefined,
    };

    productIntelligenceService
      .getPopularity(filters)
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      })
      .catch((err) => {
        if (!cancelled) console.error("Popularity fetch error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateRange, brandFilter, websiteOnly, sortBy, sortOrder, page]);

  const toggleSort = useCallback(
    (col: string) => {
      if (sortBy === col) {
        setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
      } else {
        setSortBy(col);
        setSortOrder("desc");
      }
      setPage(0);
    },
    [sortBy]
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runPriceCheck = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setPriceChecking(true);
    try {
      const results = await productIntelligenceService.runPriceCheck(
        Array.from(selectedIds)
      );
      setPriceResults(results);
    } catch (err) {
      console.error("Price check error:", err);
    } finally {
      setPriceChecking(false);
    }
  }, [selectedIds]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const SortHeader = ({
    col,
    children,
  }: {
    col: string;
    children: React.ReactNode;
  }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortBy === col && (
          <span className="text-primary">{sortOrder === "desc" ? "↓" : "↑"}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_RANGES.map((dr) => (
          <button
            key={dr.value}
            onClick={() => {
              setDateRange(dr.value);
              setPage(0);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              dateRange === dr.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {dr.label}
          </button>
        ))}

        <select
          value={brandFilter}
          onChange={(e) => {
            setBrandFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
        >
          <option value="">All brands</option>
          {brandOptions.map((b) => (
            <option key={b.brand} value={b.brand}>
              {b.brand} ({b.product_count})
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={websiteOnly}
            onChange={(e) => {
              setWebsiteOnly(e.target.checked);
              setPage(0);
            }}
            className="rounded border-border"
          />
          Website only
        </label>

        {selectedIds.size > 0 && (
          <Button
            intent="outline"
            size="sm"
            onPress={runPriceCheck}
            isDisabled={priceChecking}
          >
            {priceChecking ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Search size={14} className="mr-1.5" />
            )}
            Price Check ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Price Check Results */}
      {priceResults.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {priceResults.map((pr) => (
            <PriceCheckCard key={pr.product_id} result={pr} />
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="w-10 px-3 py-2" />
                <SortHeader col="name">Product</SortHeader>
                <SortHeader col="unique_customers">Customers</SortHeader>
                <SortHeader col="total_orders">Orders</SortHeader>
                <SortHeader col="total_quantity">Qty</SortHeader>
                <SortHeader col="total_revenue">Revenue</SortHeader>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Avg/Order
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Spread
                </th>
                <SortHeader col="trend">Trend</SortHeader>
                <SortHeader col="stock_on_hand">Stock</SortHeader>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Website
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                    Loading sales data...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    No products found matching these filters.
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr
                    key={row.product_id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.product_id)}
                        onChange={() => toggleSelect(row.product_id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {row.image_url ? (
                          <img
                            src={row.image_url}
                            alt=""
                            className="size-8 shrink-0 rounded object-cover bg-muted"
                            loading="lazy"
                          />
                        ) : (
                          <div className="size-8 shrink-0 rounded bg-muted" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground max-w-[200px]">
                            {row.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.brand} &middot; {row.sku}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-foreground">
                      {row.unique_customers}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.total_orders}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.total_quantity}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium text-foreground">
                      {formatCurrency(row.total_revenue)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.avg_qty_per_order}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          row.is_skewed
                            ? "text-amber-400"
                            : "text-muted-foreground"
                        )}
                        title={
                          row.is_skewed
                            ? `${row.max_customer_share}% from ${row.top_customer_name}`
                            : `Top customer: ${row.max_customer_share}%`
                        }
                      >
                        {row.is_skewed && <AlertTriangle size={12} />}
                        {row.max_customer_share}%
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <TrendBadge trend={row.trend} />
                    </td>
                    <td className="px-3 py-2">
                      <StockBadge stock={row.stock_on_hand} />
                    </td>
                    <td className="px-3 py-2">
                      <WebsiteBadge
                        onWebsite={row.on_website}
                        badge={row.badge}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)}{" "}
            of {totalCount}
          </span>
          <div className="flex gap-1">
            <Button
              intent="outline"
              size="sm"
              isDisabled={page === 0}
              onPress={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              intent="outline"
              size="sm"
              isDisabled={page >= totalPages - 1}
              onPress={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reorder Alerts Tab ───────────────────────────────────────

function ReorderAlertsTab() {
  const [data, setData] = useState<ReorderAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [threshold, setThreshold] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [generatingPO, setGeneratingPO] = useState(false);
  const [poSuccess, setPOSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    productIntelligenceService
      .getReorderAlerts({ threshold, limit: 100 })
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      })
      .catch((err) => {
        if (!cancelled) console.error("Reorder alerts error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [threshold]);

  const criticalCount = data.filter((d) => d.priority === "critical").length;
  const warningCount = data.filter((d) => d.priority === "warning").length;

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((d) => d.product_id)));
    }
  }, [data, selectedIds.size]);

  const handleGeneratePO = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setGeneratingPO(true);
    setPOSuccess(null);
    try {
      const items = data
        .filter((d) => selectedIds.has(d.product_id))
        .map((d) => ({
          product_id: d.product_id,
          quantity: Math.max(1, Math.ceil(30 * d.daily_velocity) - d.stock_on_hand),
        }));
      const result = await purchaseOrderService.generate(items);
      const poNumbers = result.purchase_orders.map((po) => po.po_number).join(", ");
      setPOSuccess(`Created ${result.purchase_orders.length} draft PO${result.purchase_orders.length !== 1 ? "s" : ""}: ${poNumbers}`);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Generate PO error:", err);
    } finally {
      setGeneratingPO(false);
    }
  }, [data, selectedIds]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/20">
              <AlertTriangle size={18} className="text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{criticalCount}</div>
              <div className="text-xs text-muted-foreground">Critical (&le;7 days)</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/20">
              <PackageCheck size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{warningCount}</div>
              <div className="text-xs text-muted-foreground">Warning (&le;21 days)</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <ShoppingCart size={18} className="text-muted-foreground" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{totalCount}</div>
              <div className="text-xs text-muted-foreground">Low stock total</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Threshold control + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-muted-foreground">Stock threshold:</label>
        <input
          type="range"
          min={1}
          max={50}
          value={threshold}
          onChange={(e) => setThreshold(parseInt(e.target.value))}
          className="w-40 accent-primary"
        />
        <span className="text-xs font-medium text-foreground">&le; {threshold} units</span>

        {selectedIds.size > 0 && (
          <Button
            size="sm"
            className="ml-auto bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleGeneratePO}
            isDisabled={generatingPO}
          >
            {generatingPO ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <FileSpreadsheet size={14} className="mr-1.5" />
            )}
            Create Draft PO ({selectedIds.size} items)
          </Button>
        )}
      </div>

      {/* Success message */}
      {poSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-400">{poSuccess}</span>
          <a href="/purchase-orders" className="ml-auto text-xs text-primary hover:underline">
            View Purchase Orders
          </a>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selectedIds.size === data.length}
                    onChange={toggleAll}
                    className="accent-teal-500"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Product
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Brand
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Stock
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Sold (30d)
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Daily Rate
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Days Left
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Priority
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                    Calculating stock velocity...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No low-stock website products found.
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr
                    key={row.product_id}
                    className={cn(
                      "border-t border-border",
                      row.priority === "critical" && "bg-red-500/5",
                      row.priority === "warning" && "bg-amber-500/5"
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.product_id)}
                        onChange={() => toggleSelect(row.product_id)}
                        className="accent-teal-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        {row.image_url ? (
                          <img
                            src={row.image_url}
                            alt=""
                            className="size-8 shrink-0 rounded object-cover bg-muted"
                            loading="lazy"
                          />
                        ) : (
                          <div className="size-8 shrink-0 rounded bg-muted" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground max-w-[200px]">
                            {row.name}
                          </div>
                          <div className="text-xs text-muted-foreground">{row.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.brand}</td>
                    <td className="px-3 py-2">
                      <StockBadge stock={row.stock_on_hand} />
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.sold_last_30d}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.daily_velocity}/day
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {row.days_remaining != null ? (
                        <span
                          className={cn(
                            row.days_remaining <= 7
                              ? "text-red-400"
                              : row.days_remaining <= 21
                                ? "text-amber-400"
                                : "text-foreground"
                          )}
                        >
                          {row.days_remaining}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={row.priority} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ── Shared badge components ──────────────────────────────────

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "up")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-400">
        <TrendingUp size={14} /> Up
      </span>
    );
  if (trend === "down")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-400">
        <TrendingDown size={14} /> Down
      </span>
    );
  if (trend === "new")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
        <Sparkles size={14} /> New
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus size={14} /> Stable
    </span>
  );
}

function StockBadge({ stock }: { stock: number }) {
  const color =
    stock === 0
      ? "text-red-400 bg-red-500/20 border-red-500/30"
      : stock <= 5
        ? "text-amber-400 bg-amber-500/20 border-amber-500/30"
        : "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {stock}
    </span>
  );
}

function WebsiteBadge({
  onWebsite,
  badge,
}: {
  onWebsite: boolean;
  badge: string | null;
}) {
  if (!onWebsite)
    return (
      <span className="text-xs text-muted-foreground">Not listed</span>
    );
  return (
    <div className="flex items-center gap-1">
      <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <Globe size={10} className="mr-1" /> Live
      </span>
      {badge && (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            badge === "new"
              ? "bg-primary/20 text-primary border-primary/30"
              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
          )}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "critical")
    return (
      <span className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
        Critical
      </span>
    );
  if (priority === "warning")
    return (
      <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
        Warning
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Monitor
    </span>
  );
}

function PriceCheckCard({ result }: { result: PriceCheckResult }) {
  const positionColor = {
    cheaper: "text-emerald-400 border-emerald-500/30 bg-emerald-500/20",
    competitive: "text-primary border-primary/30 bg-primary/20",
    expensive: "text-red-400 border-red-500/30 bg-red-500/20",
    unknown: "text-muted-foreground border-border bg-muted",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{result.name}</CardTitle>
        <div className="text-xs text-muted-foreground">{result.brand}</div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Our price</span>
          <span className="font-semibold text-foreground">
            {formatCurrency(result.our_price)}
          </span>
        </div>
        {result.market_avg != null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Market avg</span>
            <span className="font-medium text-foreground">
              {formatCurrency(result.market_avg)}
            </span>
          </div>
        )}
        {(result.market_low != null || result.market_high != null) && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Range</span>
            <span className="text-xs text-muted-foreground">
              {formatCurrency(result.market_low)} – {formatCurrency(result.market_high)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
              positionColor[result.our_position]
            )}
          >
            {result.our_position}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {result.confidence} confidence
          </span>
        </div>
        {result.notes && (
          <p className="text-xs text-muted-foreground pt-1">{result.notes}</p>
        )}
        {result.sources.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {result.sources.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <ExternalLink size={8} /> {s}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function ProductIntelligence() {
  usePageTitle("Product Intelligence");

  return (
    <div>
      <PageHeader
        title="Product Intelligence"
        subtitle="Sales-driven insights for website merchandising"
      />

      <Tabs defaultValue="popularity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="popularity" className="gap-1.5">
            <Users size={14} /> Popularity
          </TabsTrigger>
          <TabsTrigger value="reorder" className="gap-1.5">
            <AlertTriangle size={14} /> Reorder Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="popularity">
          <PopularityTab />
        </TabsContent>

        <TabsContent value="reorder">
          <ReorderAlertsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
