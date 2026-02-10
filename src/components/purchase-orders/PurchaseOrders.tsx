import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  PackageCheck,
  Send,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type {
  ReorderIntelligenceItem,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/types/domain";
import PageHeader from "@/components/shared/PageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

// ── Priority Badge ──────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    critical: { label: "Critical", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
    warning: { label: "Warning", cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    monitor: { label: "Monitor", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  };
  const c = config[priority] || config.monitor;
  return <Badge variant="outline" className={cn("text-[10px] font-medium", c.cls)}>{c.label}</Badge>;
}

function StockBadge({ stock }: { stock: number }) {
  const cls =
    stock === 0 ? "bg-red-500/10 text-red-500 border-red-500/20"
    : stock <= 5 ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  return <Badge variant="outline" className={cn("text-[10px] tabular-nums font-medium", cls)}>{stock}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    draft: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    received: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium capitalize", config[status] || config.draft)}>
      {status}
    </Badge>
  );
}

// ── Reorder Intelligence Tab ────────────────────────────────

function ReorderIntelligenceTab({
  onGeneratePO,
}: {
  onGeneratePO: (items: ReorderIntelligenceItem[]) => void;
}) {
  const [data, setData] = useState<ReorderIntelligenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [threshold, setThreshold] = useState(20);
  const [brandFilter, setBrandFilter] = useState("");
  const [brandOptions, setBrandOptions] = useState<{ brand: string; product_count: number }[]>([]);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const PAGE_SIZE = 50;

  useEffect(() => {
    purchaseOrderService.getBrands().then(setBrandOptions).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    purchaseOrderService
      .getReorderIntelligence({
        threshold,
        brand: brandFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      })
      .catch((err) => {
        if (!cancelled) console.error("Reorder intelligence fetch error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [threshold, brandFilter, page]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((d) => d.product_id)));
    }
  };

  const selectedItems = useMemo(
    () => data.filter((d) => selectedIds.has(d.product_id)),
    [data, selectedIds],
  );

  const summaryStats = useMemo(() => {
    const critical = data.filter((d) => d.priority === "critical").length;
    const warning = data.filter((d) => d.priority === "warning").length;
    return { critical, warning, total: data.length };
  }, [data]);

  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-red-500/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold text-red-400 tabular-nums">{summaryStats.critical}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </CardContent>
        </Card>
        <Card className="border-amber-500/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Warning</p>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{summaryStats.warning}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Low Stock</p>
              <p className="text-2xl font-bold tabular-nums">{summaryStats.total}</p>
            </div>
            <PackageCheck className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Filters + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Stock &le;</label>
          <input
            type="range"
            min={1}
            max={100}
            value={threshold}
            onChange={(e) => { setThreshold(parseInt(e.target.value)); setPage(0); }}
            className="w-24 accent-teal-500"
          />
          <span className="text-xs tabular-nums font-medium w-8">{threshold}</span>
        </div>
        <select
          value={brandFilter}
          onChange={(e) => { setBrandFilter(e.target.value); setPage(0); }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">All brands</option>
          {brandOptions.map((b) => (
            <option key={b.brand} value={b.brand}>{b.brand} ({b.product_count})</option>
          ))}
        </select>
        {selectedIds.size > 0 && (
          <Button
            size="sm"
            className="ml-auto bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => onGeneratePO(selectedItems)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Save as Draft PO ({selectedIds.size} items)
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selectedIds.size === data.length}
                    onChange={toggleAll}
                    className="accent-teal-500"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Brand</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Stock</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cost</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Sold (30d)</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Daily Rate</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Days Left</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Priority</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />Loading...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    No low-stock products found
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr
                    key={row.product_id}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/30 transition-colors",
                      row.priority === "critical" && "bg-red-500/5",
                      row.priority === "warning" && "bg-amber-500/5",
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
                      <div className="flex items-center gap-2">
                        {row.image_url ? (
                          <img src={row.image_url} alt="" className="h-8 w-8 rounded object-cover bg-muted" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate text-xs">{row.name}</p>
                          <p className="text-[10px] text-muted-foreground">{row.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{row.brand}</td>
                    <td className="px-3 py-2 text-right"><StockBadge stock={row.stock_on_hand} /></td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{formatCurrency(row.cost_price)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{row.sold_last_30d}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{row.daily_velocity.toFixed(1)}/d</td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn(
                        "text-xs tabular-nums font-medium",
                        row.days_remaining != null && row.days_remaining <= 7 ? "text-red-400"
                        : row.days_remaining != null && row.days_remaining <= 21 ? "text-amber-400"
                        : "text-foreground",
                      )}>
                        {row.days_remaining != null ? `${row.days_remaining}d` : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center"><PriorityBadge priority={row.priority} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{from}&ndash;{to} of {totalCount}</span>
          <div className="flex gap-1">
            <Button intent="outline" size="sm" isDisabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button intent="outline" size="sm" isDisabled={to >= totalCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Generate PO Modal ───────────────────────────────────────

function GeneratePOModal({
  items,
  onClose,
  onSuccess,
}: {
  items: ReorderIntelligenceItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<number, number>>(() => {
    const q: Record<number, number> = {};
    items.forEach((item) => {
      q[item.product_id] = item.suggested_qty;
    });
    return q;
  });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const grouped = useMemo(() => {
    const map: Record<string, ReorderIntelligenceItem[]> = {};
    items.forEach((item) => {
      if (!map[item.brand]) map[item.brand] = [];
      map[item.brand].push(item);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const orderItems = items.map((item) => ({
        product_id: item.product_id,
        quantity: quantities[item.product_id] || 1,
      }));
      await purchaseOrderService.generate(orderItems, notes || undefined);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PO");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Save as Draft Purchase Order</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            {grouped.length} draft PO{grouped.length !== 1 ? "s" : ""} will be saved (one per brand). Adjust quantities below. You can review, export, or email them later.
          </p>

          {grouped.map(([brand, brandItems]) => (
            <div key={brand} className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">{brand}</h4>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Product</th>
                      <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Stock</th>
                      <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Cost</th>
                      <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Qty to Order</th>
                      <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandItems.map((item) => (
                      <tr key={item.product_id} className="border-b border-border/50">
                        <td className="px-3 py-1.5">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-muted-foreground">{item.sku}</p>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{item.stock_on_hand}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(item.cost_price)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            min={1}
                            value={quantities[item.product_id] || 1}
                            onChange={(e) =>
                              setQuantities((q) => ({
                                ...q,
                                [item.product_id]: Math.max(1, parseInt(e.target.value) || 1),
                              }))
                            }
                            className="w-16 text-right rounded border border-input bg-background px-2 py-0.5 text-xs tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatCurrency((quantities[item.product_id] || 1) * (item.cost_price || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Urgent restock, delivery by end of month..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button intent="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleSubmit}
            isDisabled={submitting}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save Draft ({grouped.length} PO{grouped.length !== 1 ? "s" : ""})
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Email PO Modal ──────────────────────────────────────────

function EmailPOModal({
  po,
  onClose,
  onSent,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState(po.recipient_email || "");
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [message, setMessage] = useState("");
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    purchaseOrderService.getSavedEmails(po.brand).then(setSavedEmails).catch(() => {});
  }, [po.brand]);

  const filteredSuggestions = useMemo(
    () => savedEmails.filter((e) => e.toLowerCase().includes(email.toLowerCase()) && e !== email),
    [savedEmails, email],
  );

  const handleSend = async () => {
    if (!email) return;
    setSending(true);
    setError("");
    try {
      await purchaseOrderService.sendPO(po.id, email, format, message || undefined);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Email {po.po_number}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <label className="text-xs text-muted-foreground block mb-1">Recipient Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="supplier@example.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-32 overflow-y-auto">
                {filteredSuggestions.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onMouseDown={() => { setEmail(e); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 text-foreground"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Format</label>
            <div className="flex gap-2">
              <Button
                intent={format === "xlsx" ? "primary" : "outline"}
                size="sm"
                onClick={() => setFormat("xlsx")}
                className={format === "xlsx" ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
              </Button>
              <Button
                intent={format === "pdf" ? "primary" : "outline"}
                size="sm"
                onClick={() => setFormat("pdf")}
                className={format === "pdf" ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}
              >
                <FileText className="h-3.5 w-3.5 mr-1" /> PDF
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please find attached our purchase order..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button intent="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleSend}
            isDisabled={sending || !email}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── PO Detail Expand ────────────────────────────────────────

function PODetail({
  po,
  onRefresh,
}: {
  po: PurchaseOrder;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailModal, setEmailModal] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    purchaseOrderService
      .getById(po.id)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [po.id]);

  const handleExport = async (format: "xlsx" | "pdf") => {
    setDownloading(format);
    try {
      const blob = await purchaseOrderService.exportPO(po.id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${po.po_number}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setDownloading(null);
    }
  };

  const handleStatusUpdate = async (status: string) => {
    setUpdating(true);
    try {
      await purchaseOrderService.updatePO(po.id, { status });
      onRefresh();
    } catch (err) {
      console.error("Status update error:", err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-1" />Loading...</div>;
  if (!detail) return null;

  return (
    <div className="p-4 bg-muted/20 space-y-3">
      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button intent="outline" size="sm" onClick={() => handleExport("xlsx")} isDisabled={downloading === "xlsx"}>
          {downloading === "xlsx" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
          Excel
        </Button>
        <Button intent="outline" size="sm" onClick={() => handleExport("pdf")} isDisabled={downloading === "pdf"}>
          {downloading === "pdf" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
          PDF
        </Button>
        <Button intent="outline" size="sm" onClick={() => setEmailModal(true)}>
          <Mail className="h-3.5 w-3.5 mr-1" /> Email
        </Button>
        {detail.status === "sent" && (
          <Button intent="outline" size="sm" onClick={() => handleStatusUpdate("received")} isDisabled={updating}>
            <Check className="h-3.5 w-3.5 mr-1" /> Mark Received
          </Button>
        )}
        {(detail.status === "draft" || detail.status === "sent") && (
          <Button intent="outline" size="sm" className="text-red-400 hover:text-red-300" onClick={() => handleStatusUpdate("cancelled")} isDisabled={updating}>
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        )}
      </div>

      {/* Items */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">SKU</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Product</th>
              <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Qty</th>
              <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Unit Cost</th>
              <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(detail.items || []).map((item) => (
              <tr key={item.id} className="border-b border-border/50">
                <td className="px-3 py-1.5 text-muted-foreground">{item.sku}</td>
                <td className="px-3 py-1.5 font-medium">{item.product_name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{item.quantity}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(item.unit_cost)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(item.total_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              <td colSpan={4} className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(detail.subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {detail.notes && (
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {detail.notes}</p>
      )}

      {emailModal && (
        <EmailPOModal
          po={detail}
          onClose={() => setEmailModal(false)}
          onSent={() => { setEmailModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ── Purchase Orders Tab ─────────────────────────────────────

function PurchaseOrdersTab({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const PAGE_SIZE = 25;

  const fetchData = useCallback(() => {
    setLoading(true);
    purchaseOrderService
      .list({
        status: statusFilter || undefined,
        brand: brandFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((result) => {
        setData(result.data);
        setTotalCount(result.meta?.total ?? result.count);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter, brandFilter, page]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="text"
          value={brandFilter}
          onChange={(e) => { setBrandFilter(e.target.value); setPage(0); }}
          placeholder="Filter by brand..."
          className="h-8 rounded-md border border-input bg-background px-2 text-xs w-40"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">PO Number</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Brand</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Items</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Recipient</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Created</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Sent</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />Loading...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                  No purchase orders yet. Select products in the Reorder Intelligence tab to generate one.
                </td>
              </tr>
            ) : (
              data.map((po) => (
                <>
                  <tr
                    key={po.id}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === po.id ? null : po.id)}
                  >
                    <td className="px-3 py-2 text-muted-foreground">
                      {expandedId === po.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-3 py-2 font-medium text-xs">{po.po_number}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{po.brand}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{po.item_count ?? "-"}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">{formatCurrency(po.subtotal)}</td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={po.status} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[140px]">{po.recipient_email || "-"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(po.created_at).toLocaleDateString("en-GB")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{po.sent_at ? new Date(po.sent_at).toLocaleDateString("en-GB") : "-"}</td>
                  </tr>
                  {expandedId === po.id && (
                    <tr key={`${po.id}-detail`}>
                      <td colSpan={9} className="p-0">
                        <PODetail po={po} onRefresh={fetchData} />
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{from}&ndash;{to} of {totalCount}</span>
          <div className="flex gap-1">
            <Button intent="outline" size="sm" isDisabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button intent="outline" size="sm" isDisabled={to >= totalCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function PurchaseOrders() {
  usePageTitle("Purchase Orders");
  const [activeTab, setActiveTab] = useState("intelligence");
  const [generateItems, setGenerateItems] = useState<ReorderIntelligenceItem[] | null>(null);
  const [poRefreshKey, setPORefreshKey] = useState(0);

  const handleGeneratePO = (items: ReorderIntelligenceItem[]) => {
    setGenerateItems(items);
  };

  const handlePOCreated = () => {
    setGenerateItems(null);
    setPORefreshKey((k) => k + 1);
    setActiveTab("orders");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        subtitle="Reorder intelligence across all brands — generate, export, and email purchase orders"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="intelligence">Reorder Intelligence</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
        </TabsList>
        <TabsContent value="intelligence">
          <ReorderIntelligenceTab onGeneratePO={handleGeneratePO} />
        </TabsContent>
        <TabsContent value="orders">
          <PurchaseOrdersTab refreshKey={poRefreshKey} />
        </TabsContent>
      </Tabs>

      {generateItems && (
        <GeneratePOModal
          items={generateItems}
          onClose={() => setGenerateItems(null)}
          onSuccess={handlePOCreated}
        />
      )}
    </div>
  );
}
