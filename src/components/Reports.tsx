import { useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import PageHeader from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ReportDateRange } from '@/types/domain';
import SalesOverview from './reports/SalesOverview';
import AgentPerformance from './reports/AgentPerformance';
import BrandAnalysis from './reports/BrandAnalysis';
import CustomerInsights from './reports/CustomerInsights';
import InventoryHealth from './reports/InventoryHealth';
import FinancialReport from './reports/FinancialReport';

const DATE_RANGES: { value: ReportDateRange; label: string }[] = [
  { value: '7_days', label: '7 Days' },
  { value: '30_days', label: '30 Days' },
  { value: '90_days', label: '90 Days' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
];

export default function Reports() {
  usePageTitle('Reports');
  const [dateRange, setDateRange] = useState<ReportDateRange>('this_year');
  const [activeTab, setActiveTab] = useState('sales-overview');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Generate and export business reports"
      />

      {/* Date Range Pills */}
      <div className="flex items-center gap-2">
        {DATE_RANGES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setDateRange(value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              dateRange === value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start bg-muted/50">
          <TabsTrigger value="sales-overview">Sales Overview</TabsTrigger>
          <TabsTrigger value="agent-performance">Agent Performance</TabsTrigger>
          <TabsTrigger value="brand-analysis">Brand Analysis</TabsTrigger>
          <TabsTrigger value="customer-insights">Customer Insights</TabsTrigger>
          <TabsTrigger value="inventory-health">Inventory Health</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        <TabsContent value="sales-overview">
          <SalesOverview dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="agent-performance">
          <AgentPerformance dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="brand-analysis">
          <BrandAnalysis dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="customer-insights">
          <CustomerInsights dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="inventory-health">
          <InventoryHealth dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="financial">
          <FinancialReport dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
