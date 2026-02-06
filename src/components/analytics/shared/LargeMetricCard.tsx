import React from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import CountUp from 'react-countup';

export interface LargeMetricCardProps {
  id: string;
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  chartData?: Array<{ name: string; value: number }>;
  format?: 'currency' | 'number' | 'percentage';
  design?: 'variant1' | 'variant2' | 'variant3';
  icon?: React.ReactNode;
  color?: string;
  onClick?: () => void;
  onOptionsClick?: () => void;
  onVariantChange?: (variant: 'variant1' | 'variant2' | 'variant3') => void;
  isEditMode?: boolean;
}

const LargeMetricCard: React.FC<LargeMetricCardProps> = ({
  id,
  title,
  value,
  subtitle,
  trend,
  chartData = [],
  format = 'number',
  design = 'variant1',
  icon,
  color = '#79d5e9',
  onClick,
  onOptionsClick,
  onVariantChange,
  isEditMode = false
}) => {

  const formatValue = (val: number | string) => {
    if (typeof val === 'string') return val;

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(val);
      case 'percentage':
        return `${val.toFixed(1)}%`;
      default:
        return new Intl.NumberFormat('en-GB').format(val);
    }
  };

  const chartConfig = {
    margin: { top: 5, right: 10, bottom: 5, left: 10 },
    strokeWidth: 2,
  };

  const renderVariantSelector = () => {
    if (!onVariantChange || !isEditMode) return null;

    return (
      <div className="flex items-center gap-1 p-0.5 bg-white/5 rounded-md border border-white/10">
        <button
          className={`bg-transparent border-none py-1 px-2 rounded text-[10px] cursor-pointer transition-all duration-200 min-w-[24px] h-5 flex items-center justify-center ${design === 'variant1' ? 'bg-primary text-background font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
          onClick={(e) => {
            e.stopPropagation();
            onVariantChange('variant1');
          }}
          title="Area Chart"
        >
          1
        </button>
        <button
          className={`bg-transparent border-none py-1 px-2 rounded text-[10px] cursor-pointer transition-all duration-200 min-w-[24px] h-5 flex items-center justify-center ${design === 'variant2' ? 'bg-primary text-background font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
          onClick={(e) => {
            e.stopPropagation();
            onVariantChange('variant2');
          }}
          title="Line Chart"
        >
          2
        </button>
        <button
          className={`bg-transparent border-none py-1 px-2 rounded text-[10px] cursor-pointer transition-all duration-200 min-w-[24px] h-5 flex items-center justify-center ${design === 'variant3' ? 'bg-primary text-background font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
          onClick={(e) => {
            e.stopPropagation();
            onVariantChange('variant3');
          }}
          title="Bar Chart"
        >
          3
        </button>
      </div>
    );
  };

  const renderChart = () => {
    if (!chartData || chartData.length === 0) return null;

    const ChartComponent = design === 'variant3' ? BarChart : design === 'variant2' ? LineChart : AreaChart;
    const DataComponent = design === 'variant3' ? Bar : design === 'variant2' ? Line : Area;

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ChartComponent data={chartData} {...chartConfig}>
          <defs>
            <linearGradient id={`gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="name" hide />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: '#1a1f2a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              fontSize: '12px',
              padding: '8px'
            }}
            labelStyle={{ color: '#a0a0a0' }}
            formatter={(value: number) => [
              format === 'currency' ? `£${Math.round(value).toLocaleString()}` :
              format === 'percentage' ? `${Math.round(value)}%` :
              Math.round(value).toLocaleString(),
              ''
            ]}
          />
          {design === 'variant3' ? (
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          ) : design === 'variant2' ? (
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
          ) : (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`url(#gradient-${id})`}
              strokeWidth={2}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    );
  };

  const variantClasses = {
    variant1: 'backdrop-blur-[10px]',
    variant2: 'border-l-4 pl-5 bg-white/5 backdrop-blur-[10px] hover:opacity-95',
    variant3: 'border-t-[3px] bg-white/5 backdrop-blur-[10px] shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.3)]',
  };

  return (
    <div
      className={`bg-white/5 backdrop-blur-[10px] rounded-2xl p-5 relative transition-all duration-300 border-none h-[310px] flex flex-col cursor-pointer overflow-hidden min-w-[280px] box-border w-full hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] ${variantClasses[design]}`}
      onClick={onClick}
      style={{
        ...(design === 'variant1' && {
          borderTopColor: color,
          borderBottomColor: color,
          borderLeftColor: color,
          borderRightColor: color
        }),
        ...(design === 'variant2' && {
          borderLeftColor: color
        }),
        ...(design === 'variant3' && {
          borderTopColor: color
        }),
        background: design === 'variant1' ? `linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, ${color}15 100%)` : undefined
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white/70 m-0 uppercase tracking-wide">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {trend && (
            <div className={`flex items-center gap-1 text-sm font-semibold ${trend.isPositive ? 'text-success' : 'text-destructive'}`}>
              <span className="text-base">{trend.isPositive ? '↑' : '↓'}</span>
              <span className="text-sm">{Math.abs(trend.value).toFixed(0)}%</span>
            </div>
          )}
          {renderVariantSelector()}
          {onOptionsClick && (
            <button className="bg-transparent border-none text-white/70 cursor-pointer p-1 rounded transition-all duration-200 opacity-50 hover:bg-white/5 hover:text-white group-hover:opacity-100" onClick={(e) => {
              e.stopPropagation();
              onOptionsClick();
            }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="4" r="1.5" />
                <circle cx="10" cy="10" r="1.5" />
                <circle cx="10" cy="16" r="1.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="text-4xl font-bold text-white mt-1 mb-0.5 -tracking-wide leading-none">
        {typeof value === 'number' ? (
          <CountUp
            end={value}
            duration={1.5}
            separator=","
            prefix={format === 'currency' ? '£' : ''}
            suffix={format === 'percentage' ? '%' : ''}
            decimals={format === 'percentage' ? 1 : 0}
          />
        ) : (
          value
        )}
      </div>

      {subtitle && <div className="text-[13px] text-white/70 mb-3">{subtitle}</div>}

      {chartData && chartData.length > 0 && (
        <div className="flex-1 -mx-2 min-h-[80px] max-h-[100px] overflow-hidden relative">
          {renderChart()}
        </div>
      )}

      {chartData && chartData.length > 0 && (
        <div className="flex justify-between text-[11px] text-white/70 mt-1 px-2 opacity-70">
          <span>{chartData[0]?.name}</span>
          <span>{chartData[chartData.length - 1]?.name}</span>
        </div>
      )}
    </div>
  );
};

export default LargeMetricCard;
