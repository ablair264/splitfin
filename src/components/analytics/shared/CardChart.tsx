import React from 'react';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';

interface CardChartProps {
  id: string;
  title: string;
  subtitle?: string;
  data: Array<any>;
  type: 'area' | 'line' | 'bar' | 'pie' | 'radial' | 'donut';
  dataKey?: string;
  colors?: string[];
  showLegend?: boolean;
  height?: number;
  design?: 'default' | 'horizontal-bars' | 'pie-with-legend';
  onOptionsClick?: () => void;
  onClick?: () => void;
}

const CardChart: React.FC<CardChartProps> = ({
  id,
  title,
  subtitle,
  data,
  type,
  dataKey = 'value',
  colors = ['#79d5e9', '#4daeac', '#61bc8e', '#fbbf24', '#dc2626'],
  showLegend = false,
  height = 200,
  design = 'default',
  onOptionsClick,
  onClick
}) => {
  const renderChart = () => {
    const labels = data.map(item => item.name || item.label);
    const values = data.map(item => item[dataKey]);

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: showLegend,
          position: 'bottom' as const,
          labels: {
            color: '#a0a0a0',
            usePointStyle: true,
          }
        },
        tooltip: {
          backgroundColor: '#1a1f2a',
          titleColor: '#a0a0a0',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          cornerRadius: 8,
        },
      },
    };

    switch (type) {
      case 'pie':
      case 'donut':
        const chartData = {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: colors.map(color => color),
            borderWidth: 1,
          }],
        };

        const pieOptions = {
          ...commonOptions,
          cutout: type === 'donut' ? '60%' : 0,
        };

        const ChartComponent = type === 'donut' ? Doughnut : Pie;
        return (
          <div style={{ width: '100%', height: height }}>
            <ChartComponent data={chartData} options={pieOptions} />
          </div>
        );

      case 'bar':
        const barData = {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors[0],
            borderColor: colors[0],
            borderWidth: 1,
            borderRadius: design === 'horizontal-bars' ? { topRight: 4, bottomRight: 4 } : { topLeft: 4, topRight: 4 },
          }],
        };

        const barOptions = {
          ...commonOptions,
          indexAxis: design === 'horizontal-bars' ? 'y' as const : 'x' as const,
          scales: {
            x: {
              display: true,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#666', font: { size: 11 } }
            },
            y: {
              display: true,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#666', font: { size: 11 } }
            },
          },
        };

        return (
          <div style={{ width: '100%', height: height }}>
            <Bar data={barData} options={barOptions} />
          </div>
        );

      case 'line':
      case 'area':
      default:
        const lineData = {
          labels,
          datasets: [{
            data: values,
            borderColor: colors[0],
            backgroundColor: type === 'area' ? `${colors[0]}40` : 'transparent',
            fill: type === 'area',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
          }],
        };

        const lineOptions = {
          ...commonOptions,
          scales: {
            x: {
              display: true,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#666', font: { size: 11 } }
            },
            y: {
              display: true,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#666', font: { size: 11 } }
            },
          },
          elements: {
            point: { radius: 0, hoverRadius: 4 },
          },
        };

        return (
          <div style={{ width: '100%', height: height }}>
            <Line data={lineData} options={lineOptions} />
          </div>
        );
    }
  };

  return (
    <div
      className="bg-card rounded-xl p-4 border border-border/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md [&_canvas]:max-w-full [&_canvas]:max-h-full"
      onClick={onClick}
    >
      {(title || subtitle) && (
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            {title && <h3 className="text-base font-semibold text-foreground m-0 mb-1">{title}</h3>}
            {subtitle && <p className="text-sm text-muted-foreground m-0">{subtitle}</p>}
          </div>
          {onOptionsClick && (
            <div className="flex items-center gap-2">
              <button
                className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 rounded opacity-60 transition-all duration-200 hover:bg-muted hover:text-foreground hover:opacity-100"
                onClick={onOptionsClick}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="10" cy="4" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="10" cy="16" r="1.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
      <div className="relative w-full h-full flex items-center justify-center min-h-0">
        {renderChart()}
      </div>
    </div>
  );
};

export default CardChart;
