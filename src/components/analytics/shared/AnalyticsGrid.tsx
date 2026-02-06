import React from 'react';

export interface AnalyticsGridProps {
  children: React.ReactNode;
  className?: string;
  columns?: 1 | 2 | 3 | 4 | 'auto';
  gap?: 'small' | 'medium' | 'large';
  responsive?: boolean;
}

const columnClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  auto: 'grid-cols-[repeat(auto-fit,minmax(300px,1fr))]',
};

const responsiveColumnClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  auto: 'grid-cols-[repeat(auto-fit,minmax(300px,1fr))]',
};

const gapClasses = {
  small: 'gap-3',
  medium: 'gap-5 max-md:gap-4 max-sm:gap-3',
  large: 'gap-7 max-md:gap-5 max-sm:gap-4',
};

const AnalyticsGrid: React.FC<AnalyticsGridProps> = ({
  children,
  className = '',
  columns = 2,
  gap = 'medium',
  responsive = true
}) => {
  const colClass = responsive ? responsiveColumnClasses[columns] : columnClasses[columns];
  const gapClass = gapClasses[gap];

  return (
    <div className={`grid w-full ${colClass} ${gapClass} ${className}`.trim()}>
      {children}
    </div>
  );
};

// Grid item wrapper component
export interface GridItemProps {
  children: React.ReactNode;
  colSpan?: 1 | 2 | 3 | 4 | 'full';
  rowSpan?: 1 | 2 | 3 | 4;
  className?: string;
}

const colSpanClasses: Record<string | number, string> = {
  1: 'col-span-1 max-md:col-span-1',
  2: 'col-span-2 max-md:col-span-1',
  3: 'col-span-3 max-lg:col-span-2 max-md:col-span-1',
  4: 'col-span-4 max-lg:col-span-2 max-md:col-span-1',
  full: 'col-span-full',
};

const rowSpanClasses: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2 max-md:row-span-1',
  3: 'row-span-3 max-md:row-span-1',
  4: 'row-span-4 max-md:row-span-1',
};

export const GridItem: React.FC<GridItemProps> = ({
  children,
  colSpan = 1,
  rowSpan = 1,
  className = ''
}) => {
  const colClass = colSpanClasses[colSpan] || 'col-span-1';
  const rowClass = rowSpan > 1 ? rowSpanClasses[rowSpan] : '';

  return (
    <div className={`min-h-0 min-w-0 ${colClass} ${rowClass} ${className}`.trim()}>
      {children}
    </div>
  );
};

export default AnalyticsGrid;
