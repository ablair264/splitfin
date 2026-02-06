import React from 'react';
import CountUp from 'react-countup';

export interface CompactCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  format?: 'currency' | 'number' | 'percentage';
  color?: string;
  onClick?: () => void;
}

const CompactCard: React.FC<CompactCardProps> = ({
  title,
  value,
  icon,
  trend,
  format = 'number',
  color = '#79d5e9',
  onClick
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

  return (
    <div
      className="bg-white/5 backdrop-blur-[10px] rounded-[10px] py-3.5 px-4 flex items-center gap-3 transition-all duration-300 border-none h-[68px] cursor-pointer relative overflow-hidden box-border w-full hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
      onClick={onClick}
      style={{
        borderLeftColor: color,
        borderLeftWidth: '3px',
        borderLeftStyle: 'solid'
      }}
    >
      <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-white text-lg" style={{ backgroundColor: color }}>
        {icon || '💰'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-bold text-white leading-none mb-0.5">
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
        <div className="text-[11px] text-white/70 font-medium uppercase tracking-wide">{title}</div>
      </div>
      {trend && (
        <div className={`flex items-center gap-0.5 text-[11px] font-semibold py-[3px] px-2 rounded-2xl ${trend.isPositive ? 'text-[#61bc8e] bg-[rgba(97,188,142,0.1)]' : 'text-destructive bg-destructive/10'}`}>
          <span className="text-xs">{trend.isPositive ? '↗' : '↘'}</span>
          <span className="text-[10px]">+{Math.abs(trend.value).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
};

export default CompactCard;
