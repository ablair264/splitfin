import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Download, FileText, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, FinancialData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const AGEING_COLORS: Record<string, string> = {
  'Current': 'hsl(var(--chart-1))',
  '1-30 days': 'hsl(var(--chart-2))',
  '31-60 days': 'hsl(var(--chart-3))',
  '61-90 days': 'hsl(var(--chart-4))',
  '90+ days': 'hsl(var(--destructive))',
};

export default function FinancialReport({ dateRange }: { dateRange: ReportDateRange }) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.financial(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, ageing } = data;

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Invoiced" value={formatGBP(summary.total_invoiced)} icon={FileText} color="blue" />
        <StatCard label="Outstanding" value={formatGBP(summary.total_outstanding)} icon={DollarSign} color="amber" />
        <StatCard label="Overdue Count" value={summary.overdue_count.toLocaleString()} icon={AlertTriangle} color="red" />
        <StatCard label="Overdue Amount" value={formatGBP(summary.overdue_amount)} icon={Clock} color="red" />
      </div>

      {/* Ageing Chart */}
      {ageing.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Invoice Ageing</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ageing}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(value: number) => [formatGBP(value), 'Amount']} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {ageing.map((entry, i) => (
                    <Cell key={i} fill={AGEING_COLORS[entry.bucket] || 'hsl(var(--chart-5))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ageing Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Ageing Breakdown</h3>
            <Button intent="outline" size="sm" onPress={() => reportService.exportCsv('financial', dateRange)}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Bucket</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Invoices</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ageing.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.bucket}</td>
                    <td className="py-2 text-right tabular-nums">{row.invoice_count.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(row.amount)}</td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-4">Total Outstanding</td>
                  <td className="py-2 text-right tabular-nums">{ageing.reduce((s, r) => s + r.invoice_count, 0).toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{formatGBP(ageing.reduce((s, r) => s + r.amount, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
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
      <div className="h-[320px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
