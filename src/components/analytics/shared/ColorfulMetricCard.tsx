import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import CountUp from 'react-countup';
import { useColors } from './ColorProvider';

export interface ColorfulMetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  chartData?: Array<{ name: string; value: number }>;
  color?: 'purple' | 'blue' | 'orange' | 'green' | 'red' | 'yellow' | string;
  format?: 'currency' | 'number' | 'percentage';
  onClick?: () => void;
  className?: string;
  cardIndex?: number; // For multicolored mode
  useContextColors?: boolean; // Whether to use context colors instead of predefined
}

const gradientMap: Record<string, string> = {
  purple: 'from-[#7c3aed] to-[#a78bfa]',
  blue: 'from-[#3b82f6] to-[#60a5fa]',
  orange: 'from-[#f97316] to-[#fb923c]',
  green: 'from-[#10b981] to-[#34d399]',
  red: 'from-[#ef4444] to-[#f87171]',
  yellow: 'from-[#f59e0b] to-[#fbbf24]',
};

const ColorfulMetricCard: React.FC<ColorfulMetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  chartData,
  color,
  format = 'number',
  onClick,
  className = '',
  cardIndex = 0,
  useContextColors = false
}) => {
  const { getMetricCardColor } = useColors();

  // Determine final color to use
  const finalColor = useContextColors ? getMetricCardColor(cardIndex) : color || 'blue';

  const formatValue = (val: number | string) => {
    if (typeof val === 'string') return val;

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(val);
      case 'percentage':
        return `${val.toFixed(1)}%`;
      default:
        return val.toLocaleString();
    }
  };

  const getTrendIcon = () => {
    if (!trend) return null;

    const Icon = trend.isPositive ? TrendingUp : TrendingDown;
    return <Icon size={16} />;
  };

  // Handle both predefined color names and hex values
  const isCustomColor = useContextColors || finalColor.startsWith('#');
  const gradientClass = !isCustomColor && gradientMap[finalColor] ? gradientMap[finalColor] : '';

  const customColorStyle = isCustomColor ? {
    '--gradient-start': finalColor,
    '--gradient-end': `${finalColor}CC`,
  } as React.CSSProperties : {};

  const backgroundStyle = isCustomColor
    ? { background: `linear-gradient(135deg, var(--gradient-start), var(--gradient-end))`, ...customColorStyle }
    : {};

  return (
    <div
      className={`relative rounded-[20px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden min-h-[160px] flex flex-col justify-between text-white hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] before:content-[''] before:absolute before:-top-1/2 before:-right-[30%] before:w-[200%] before:h-[200%] before:bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_70%)] before:rotate-45 before:pointer-events-none max-md:p-5 max-md:min-h-[140px] ${gradientClass ? `bg-gradient-to-br ${gradientClass}` : ''} ${className}`}
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        ...backgroundStyle
      }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="text-[28px] opacity-90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)] max-md:text-2xl">{icon}</div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-[20px] backdrop-blur-[10px] ${trend.isPositive ? 'bg-[rgba(16,185,129,0.2)]' : 'bg-[rgba(239,68,68,0.2)]'}`}>
            {getTrendIcon()}
            <span>{trend.value > 0 ? '+' : ''}{trend.value.toFixed(0)}%</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-2">
        <h3 className="text-sm font-medium opacity-90 m-0 uppercase tracking-wide max-md:text-[13px]">{title}</h3>
        <div className="text-[32px] font-bold leading-none my-2 -tracking-[0.5px] max-md:text-[28px]">
          {typeof value === 'number' ? (
            <CountUp
              start={0}
              end={value}
              duration={1.5}
              separator=","
              formattingFn={formatValue}
            />
          ) : (
            formatValue(value)
          )}
        </div>
        {subtitle && <p className="text-[13px] opacity-80 m-0 font-normal max-md:text-xs">{subtitle}</p>}
      </div>

      {chartData && chartData.length > 0 && (
        <div className="mt-4 h-[60px] overflow-hidden">
          <div className="w-full h-full">
            {/* Simple sparkline-style chart using SVG */}
            <svg width="100%" height="60" viewBox="0 0 300 60" className="w-full h-full">
              <defs>
                <linearGradient id={`gradient-${title.replace(/\s/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={finalColor} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={finalColor} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {(() => {
                const values = chartData.map(d => d.value);
                const maxValue = Math.max(...values);
                const minValue = Math.min(...values);
                const range = maxValue - minValue || 1;

                const points = chartData.map((d, i) => {
                  const x = (i / (chartData.length - 1)) * 300;
                  const y = 60 - ((d.value - minValue) / range) * 50;
                  return `${x},${y}`;
                }).join(' ');

                const pathData = `M ${points.split(' ').map(p => p).join(' L ')} L 300,60 L 0,60 Z`;

                return (
                  <>
                    <path
                      d={pathData}
                      fill={`url(#gradient-${title.replace(/\s/g, '')})`}
                      stroke={finalColor}
                      strokeWidth="2"
                    />
                    <polyline
                      points={points}
                      fill="none"
                      stroke={finalColor}
                      strokeWidth="2"
                    />
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorfulMetricCard;
