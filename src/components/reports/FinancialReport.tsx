import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { reportService, type ReportFilters } from '@/services/reportService';
import type { ReportDateRange, FinancialData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const AGEING_COLORS: Record<string, string> = {
  'Current': 'var(--chart-1)',
  '1-30 days': 'var(--chart-2)',
  '31-60 days': 'var(--chart-3)',
  '61-90 days': 'var(--chart-4)',
  '90+ days': 'var(--destructive)',
};

const ageingConfig = {
  amount: { label: 'Amount', color: 'var(--chart-1)' },
} satisfies ChartConfig;

function AgeingTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      <p className="font-mono font-medium tabular-nums text-foreground">{formatGBP(payload[0].value)}</p>
    </div>
  );
}

export default function FinancialReport({ dateRange, filters }: { dateRange: ReportDateRange; filters?: ReportFilters }) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.financial(dateRange, filters).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { summary, ageing } = data;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Invoiced</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(summary.total_invoiced)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Outstanding</CardDescription>
            <CardTitle className="text-xl tabular-nums text-amber-400">{formatGBP(summary.total_outstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Overdue Count</CardDescription>
            <CardTitle className="text-xl tabular-nums text-red-400">{summary.overdue_count.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Overdue Amount</CardDescription>
            <CardTitle className="text-xl tabular-nums text-red-400">{formatGBP(summary.overdue_amount)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {ageing.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Invoice Ageing</h3>
            <ChartContainer config={ageingConfig} className="h-[200px] w-full">
              <BarChart data={ageing}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<AgeingTooltip />} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {ageing.map((entry, i) => (
                    <Cell key={i} fill={AGEING_COLORS[entry.bucket] || 'var(--chart-5)'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Ageing Breakdown</h3>
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

function Skeleton() {
  return (
    <div className="space-y-4 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[240px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
