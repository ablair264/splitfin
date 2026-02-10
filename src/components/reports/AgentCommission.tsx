import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Download } from 'lucide-react';
import { reportService } from '@/services/reportService';
import type { ReportDateRange, AgentCommissionData } from '@/types/domain';

const formatGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const chartConfig = {
  commission_earned: { label: 'Commission', color: 'var(--chart-3)' },
} satisfies ChartConfig;

function GBPTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium mb-1">{item.payload?.name}</p>
      <p className="font-mono font-medium tabular-nums text-foreground">{formatGBP(item.value)}</p>
    </div>
  );
}

interface AgentCommissionProps {
  dateRange: ReportDateRange;
}

export default function AgentCommission({ dateRange }: AgentCommissionProps) {
  const [data, setData] = useState<AgentCommissionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportService.agentCommission(dateRange).then(result => {
      if (!cancelled) { setData(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) return <Skeleton />;
  if (!data) return <p className="text-muted-foreground p-4">Failed to load report data.</p>;

  const { agents, totals } = data;

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Revenue</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(totals.total_revenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Commission</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatGBP(totals.total_commission)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="py-4 gap-3">
          <CardHeader className="px-4 pb-0 gap-1">
            <CardDescription className="text-[11px] uppercase tracking-wider font-medium">Total Orders</CardDescription>
            <CardTitle className="text-xl tabular-nums">{totals.total_orders.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Commission by Agent Chart */}
      {agents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Commission Earned by Agent</h3>
            <ChartContainer config={chartConfig} className="w-full" style={{ height: Math.max(200, agents.length * 48) }}>
              <BarChart data={agents} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <ChartTooltip cursor={false} content={<GBPTooltip />} />
                <Bar dataKey="commission_earned" fill="var(--color-commission_earned)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Agent Commission Table with per-agent export */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Commission Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Agent</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Rate</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Orders</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Revenue</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Commission Earned</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Customers</th>
                  <th className="pb-2 font-medium text-muted-foreground text-center w-10">Export</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-medium">{a.name}</td>
                    <td className="py-2 text-right tabular-nums">{(a.commission_rate * 100).toFixed(1)}%</td>
                    <td className="py-2 text-right tabular-nums">{a.order_count.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{formatGBP(a.revenue)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatGBP(a.commission_earned)}</td>
                    <td className="py-2 text-right tabular-nums">{a.customer_count.toLocaleString()}</td>
                    <td className="py-2 text-center">
                      <button
                        onClick={() => reportService.exportFile('agent-commission', dateRange, 'xlsx', { agent_id: a.id })}
                        className="text-muted-foreground hover:text-foreground transition-colors inline-flex"
                        title={`Export ${a.name}'s commission report`}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="pt-3 pr-4">Total</td>
                  <td className="pt-3 text-right" />
                  <td className="pt-3 text-right tabular-nums">{totals.total_orders.toLocaleString()}</td>
                  <td className="pt-3 text-right tabular-nums">{formatGBP(totals.total_revenue)}</td>
                  <td className="pt-3 text-right tabular-nums">{formatGBP(totals.total_commission)}</td>
                  <td className="pt-3 text-right" />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 mt-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/50" />)}
      </div>
      <div className="h-[300px] rounded-lg bg-muted/50" />
      <div className="h-[200px] rounded-lg bg-muted/50" />
    </div>
  );
}
