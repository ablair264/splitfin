import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Download, Package, AlertTriangle, Archive, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, InventoryHealthData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export default function InventoryHealth({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<InventoryHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.inventoryHealth(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, brands, slow_movers } = data;
  const chartData = brands.slice(0, 10).map(b => ({
    brand: b.brand,
    in_stock: b.total_stock,
    out_of_stock: b.out_of_stock,
  }));

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Products" value={summary.active_products.toLocaleString()} icon={Package} color="blue" />
        <StatCard label="Out of Stock" value={summary.out_of_stock.toLocaleString()} icon={AlertTriangle} color="red" />
        <StatCard label="Low Stock (≤5)" value={summary.low_stock.toLocaleString()} icon={Archive} color="amber" />
        <StatCard label="Stock Value" value={formatGBP(summary.stock_value)} icon={DollarSign} color="emerald" />
      </div>

      {/* Brand Stock Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Stock Status by Brand (Top 10)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="brand" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} angle={-25} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="in_stock" name="In Stock" fill="hsl(var(--chart-1))" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="out_of_stock" name="Out of Stock" fill="hsl(var(--destructive))" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Slow Movers Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Slow Movers (In stock, not sold in 90+ days)</h3>
            <Button intent="outline" size="sm" onPress={() => reportService.exportCsv('inventory-health', dateRange)}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
          {slow_movers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No slow movers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Product</th>
                    <th className="pb-2 font-medium text-muted-foreground">SKU</th>
                    <th className="pb-2 font-medium text-muted-foreground">Brand</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Stock</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Price</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Last Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {slow_movers.map((p, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 max-w-[200px] truncate">{p.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">{p.sku}</td>
                      <td className="py-2 pr-4">{p.brand}</td>
                      <td className="py-2 text-right tabular-nums">{p.stock_on_hand}</td>
                      <td className="py-2 text-right tabular-nums">{formatGBP(p.rate)}</td>
                      <td className="py-2 text-right">
                        {p.last_sold ? (
                          <span className="text-muted-foreground">{p.last_sold}</span>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">Never</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-500/20 text-emerald-400',
    blue: 'border-blue-500/20 text-blue-400',
    amber: 'border-amber-500/20 text-amber-400',
    red: 'border-red-500/20 text-red-400',
  };
  const cls = colorMap[color] || 'border-zinc-500/20 text-zinc-400';
  const [borderCls, iconCls] = cls.split(' ');
  return (
    <Card className={borderCls}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${iconCls}`} />
      </CardContent>
    </Card>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[340px] rounded-lg bg-muted/50" />
      <div className="h-[300px] rounded-lg bg-muted/50" />
    </div>
  );
}
