import React from 'react';

interface TableCardColumn {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface TableCardProps {
  id: string;
  title: string;
  subtitle?: string;
  data: Array<any>;
  columns: TableCardColumn[];
  getAvatar?: (row: any) => string | null;
  valueColor?: (value: any, row: any) => string;
  maxRows?: number;
}

const TableCard: React.FC<TableCardProps> = ({
  id,
  title,
  subtitle,
  data,
  columns,
  getAvatar,
  valueColor,
  maxRows = 6
}) => {
  const displayData = data.slice(0, maxRows);

  return (
    <div className="bg-card rounded-2xl p-6 border border-border/60 transition-all duration-300 h-auto min-h-[280px] flex flex-col hover:shadow-lg max-md:min-h-[240px] max-md:p-4">
      <div className="flex justify-between items-start mb-5">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground m-0 mb-1 max-md:text-sm">{title}</h3>
          {subtitle && <p className="text-[13px] text-muted-foreground m-0 max-md:text-xs">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <div className="flex flex-col">
          {/* Table header */}
          <div className="flex items-center gap-3 py-3 border-b border-border/60 flex-wrap">
            {columns.map((column) => (
              <div
                key={column.key}
                className="font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap"
                style={{
                  textAlign: column.align || 'left',
                  width: column.width
                }}
              >
                {column.label}
              </div>
            ))}
          </div>

          {/* Table rows */}
          {displayData.map((row, index) => (
            <div key={`${id}-row-${index}`} className="flex items-center gap-3 py-3 border-b border-border/10 last:border-b-0 flex-wrap">
              {columns.map((column) => (
                <div
                  key={column.key}
                  className="text-sm text-foreground"
                  style={{
                    textAlign: column.align || 'left',
                    width: column.width
                  }}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </div>
              ))}
            </div>
          ))}
        </div>
        {displayData.length === 0 && (
          <div className="flex items-center justify-center h-[150px] text-muted-foreground text-[13px]">
            <p>No data available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableCard;
