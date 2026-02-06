import React, { useState } from 'react';
import CardChart from './CardChart';
import DataTable from './DataTable';
import type { TableColumn } from './DataTable';

export interface ChartDataItem {
  name: string;
  value: number;
  [key: string]: any;
}

export interface FlexibleChartProps {
  id?: string;
  title: string;
  subtitle?: string;
  data: ChartDataItem[];
  defaultType?: 'horizontal-bar' | 'pie' | 'vertical-bar' | 'table';
  showTypeSwitcher?: boolean;
  height?: number;
  colors?: string[];
  loading?: boolean;
  error?: string | null;
  onClick?: () => void;
  formatValue?: (value: number) => string;
  showRanking?: boolean;
  maxItems?: number;
  emptyMessage?: string;
  tableColumns?: Array<{
    key: string;
    header: string;
    width?: string;
    render?: (item: ChartDataItem, index?: number) => React.ReactNode;
  }>;
}

const FlexibleChart: React.FC<FlexibleChartProps> = ({
  id = 'flexible-chart',
  title,
  subtitle,
  data,
  defaultType = 'horizontal-bar',
  showTypeSwitcher = false,
  height = 300,
  colors = ['#79d5e9', '#4daeac', '#61bc8e', '#fbbf24', '#dc2626'],
  loading = false,
  error = null,
  onClick,
  formatValue = (value) => value.toLocaleString(),
  showRanking = false,
  maxItems,
  emptyMessage = 'No data available',
  tableColumns
}) => {
  const [currentType, setCurrentType] = useState(defaultType);

  // Chart type options
  const chartTypeOptions = [
    { value: 'horizontal-bar', label: 'Horizontal Bars', icon: '📊' },
    { value: 'pie', label: 'Pie Chart', icon: '🥧' },
    { value: 'vertical-bar', label: 'Vertical Bars', icon: '📈' },
    { value: 'table', label: 'Table', icon: '📋' }
  ];

  // Process data
  const processedData = maxItems ? data.slice(0, maxItems) : data;

  // Prepare data for charts
  const chartData = processedData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length]
  }));

  // Default table columns if not provided
  const defaultTableColumns: TableColumn<ChartDataItem>[] = [
    ...(showRanking ? [{
      key: 'rank',
      header: '#',
      width: '60px',
      className: 'text-center pr-4',
      render: (_: ChartDataItem, index?: number) => (
        <span className="inline-flex items-center justify-center w-7 h-7 bg-white/5 border border-white/10 rounded-md text-xs font-semibold text-muted-foreground">{(index || 0) + 1}</span>
      )
    }] : []),
    {
      key: 'name',
      header: 'NAME',
      width: showRanking ? '60%' : '70%',
      render: (item) => (
        <span className="font-medium text-foreground text-sm">{item.name}</span>
      )
    },
    {
      key: 'value',
      header: 'TOTAL',
      width: showRanking ? '30%' : '30%',
      className: 'text-right',
      render: (item) => (
        <span className="font-semibold text-primary text-sm">
          {formatValue(item.value)}
        </span>
      )
    }
  ];

  // Use provided columns or default ones
  const columns = tableColumns ? tableColumns.map(col => ({
    key: col.key,
    header: col.header,
    width: col.width,
    className: col.key === 'value' ? 'text-right' : undefined,
    render: col.render ? (item: ChartDataItem, index?: number) => col.render!(item, index) : undefined
  })) : defaultTableColumns;

  // Render chart type switcher
  const renderTypeSwitcher = () => {
    if (!showTypeSwitcher) return null;

    return (
      <div className="flex gap-1 shrink-0 max-md:flex-col">
        {chartTypeOptions.map(option => (
          <button
            key={option.value}
            className={`w-8 h-8 border rounded-md bg-white/5 text-muted-foreground cursor-pointer transition-all duration-200 flex items-center justify-center text-sm p-0 hover:bg-white/10 hover:border-white/20 hover:text-foreground ${
              currentType === option.value ? 'bg-primary/20 border-primary text-primary' : 'border-white/10'
            }`}
            onClick={() => setCurrentType(option.value as any)}
            title={option.label}
          >
            {option.icon}
          </button>
        ))}
      </div>
    );
  };

  // Render content based on current type
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground text-sm gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-primary rounded-full animate-spin"></div>
          <span>Loading data...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-[200px] text-destructive text-sm gap-3">
          <span>⚠️ {error}</span>
        </div>
      );
    }

    if (processedData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground text-sm gap-3">
          <span>📊 {emptyMessage}</span>
        </div>
      );
    }

    if (currentType === 'table') {
      return (
        <div className="-my-1">
          <DataTable
            columns={columns}
            data={processedData}
            keyExtractor={(item: ChartDataItem) => item.id || item.name || Math.random().toString()}
            className="bg-transparent border-none"
          />
        </div>
      );
    }

    // Determine chart design and type
    let design = 'default';
    let type: 'bar' | 'pie' = 'bar';

    switch (currentType) {
      case 'horizontal-bar':
        design = 'horizontal-bars';
        type = 'bar';
        break;
      case 'pie':
        design = 'pie-with-legend';
        type = 'pie';
        break;
      case 'vertical-bar':
        design = 'default';
        type = 'bar';
        break;
    }

    return (
      <div className="-my-2">
        <CardChart
          id={id}
          title=""
          data={chartData}
          type={type}
          dataKey="value"
          colors={colors}
          height={height - 80} // Account for header
          design={design as any}
          showLegend={currentType === 'pie'}
          onClick={onClick}
        />
      </div>
    );
  };

  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden transition-all duration-200 cursor-pointer hover:border-white/20 hover:shadow-md" onClick={onClick}>
      <div className="flex justify-between items-start px-5 pt-5 gap-4 max-md:px-4 max-md:pt-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground m-0 mb-1 leading-snug max-md:text-base">{title}</h3>
          {subtitle && <p className="text-[13px] text-muted-foreground m-0 leading-normal max-md:text-xs">{subtitle}</p>}
        </div>
        {renderTypeSwitcher()}
      </div>
      <div className="p-5 max-md:p-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default FlexibleChart;
