import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import CountUp from 'react-countup';
import { useColors } from './ColorProvider';
import styles from './MetricCard.module.css';

export interface MetricCardProps {
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
  displayMode?: 'compact' | 'medium' | 'large';
  design?: 'variant1' | 'variant2' | 'variant3';
  icon?: React.ReactNode;
  color?: string;
  onClick?: () => void;
  onOptionsClick?: () => void;
  onVariantChange?: (variant: 'variant1' | 'variant2' | 'variant3') => void;
  cardIndex?: number;
  isEditMode?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  id,
  title,
  value,
  subtitle,
  trend,
  chartData = [],
  format = 'number',
  displayMode = 'medium',
  design = 'variant1',
  icon,
  color: propColor,
  onClick,
  onOptionsClick,
  onVariantChange,
  cardIndex = 0,
  isEditMode = false
}) => {
  const { getMetricCardColor } = useColors();
  
  // Use context color if no specific color is provided
  const color = propColor || getMetricCardColor(cardIndex);

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

  const renderVariantSelector = (isEditMode: boolean = false) => {
    // Only show variant selector in edit mode AND when onVariantChange is provided
    if (!onVariantChange || !isEditMode) return null;
    
    return (
      <div className={styles.variantSelector}>
        <button
          className={`${styles.variantButton} ${design === 'variant1' ? styles.active : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onVariantChange('variant1');
          }}
          title="Area Chart"
        >
          1
        </button>
        <button
          className={`${styles.variantButton} ${design === 'variant2' ? styles.active : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onVariantChange('variant2');
          }}
          title="Line Chart"
        >
          2
        </button>
        <button
          className={`${styles.variantButton} ${design === 'variant3' ? styles.active : ''}`}
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
    if (!chartData || chartData.length === 0) {
      return null;
    }

    if (design === 'variant1') {
      // Line chart for variant 1
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    } else if (design === 'variant2') {
      // Bar chart for variant 2
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    } else {
      // Area chart for variant 3
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${id})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    }
  };

  if (displayMode === 'compact') {
    return (
      <div 
        className={styles.metricCardCompact} 
        onClick={onClick} 
        style={{ 
          borderLeftColor: color,
          borderLeftWidth: '3px'
        }}
      >
        <div className={styles.compactIcon} style={{ backgroundColor: color }}>
          {icon || '💰'}
        </div>
        <div className={styles.compactContent}>
          <div className={styles.compactValue}>
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
          <div className={styles.compactTitle}>{title}</div>
        </div>
        {trend && (
          <div className={`${styles.compactTrend} ${trend.isPositive ? styles.positive : styles.negative}`}>
            <span className={styles.trendIcon}>{trend.isPositive ? '↗' : '↘'}</span>
            <span className={styles.trendValue}>+{Math.abs(trend.value).toFixed(0)}%</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`${styles.metricCardFull} ${styles[`metricCard${design.charAt(0).toUpperCase() + design.slice(1)}`]} ${styles[displayMode]}`} 
      onClick={onClick} 
      style={{
        ...(design === 'variant1' && {
          borderLeftColor: color
        }),
        ...(design === 'variant2' && {
          borderTopColor: color
        }),
        ...(design === 'variant3' && {
          borderTopColor: color,
          borderBottomColor: color,
          borderLeftColor: color,
          borderRightColor: color
        }),
        backdropFilter: design === 'variant1' ? 'blur(10px)' : undefined
      }}
    >
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <h3 className={styles.cardTitle}>{title}</h3>
        </div>
        <div className={styles.headerRight}>
          {trend && (
            <div className={`${styles.trendIndicator} ${trend.isPositive ? styles.positive : styles.negative}`}>
              <span className={styles.trendIcon}>{trend.isPositive ? '↑' : '↓'}</span>
              <span className={styles.trendValue}>{Math.abs(trend.value).toFixed(0)}%</span>
            </div>
          )}
          {renderVariantSelector(isEditMode)}
          {onOptionsClick && (
            <button className={styles.optionsButton} onClick={(e) => {
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
      
      <div className={styles.cardValue}>
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
      
      {subtitle && <div className={styles.cardSubtitle}>{subtitle}</div>}
      
      {chartData && chartData.length > 0 && (
        <div className={styles.cardChart}>
          {renderChart()}
        </div>
      )}
      
      {chartData && chartData.length > 0 && (
        <div className={styles.cardDateRange}>
          <span>{chartData[0]?.name}</span>
          <span>{chartData[chartData.length - 1]?.name}</span>
        </div>
      )}
    </div>
  );
};

export default MetricCard;