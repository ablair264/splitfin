import React from 'react';

interface TableColumn {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'number' | 'currency' | 'percentage' | 'date';
}

interface CleanTableCardProps {
  data: Array<any>;
  columns: TableColumn[];
  backgroundColor?: string;
  textColor?: string;
  headerColor?: string;
  borderColor?: string;
  maxRows?: number;
}

const CleanTableCard: React.FC<CleanTableCardProps> = ({
  data,
  columns,
  backgroundColor = '#1a1f2a',
  textColor = '#ffffff',
  headerColor = '#79d5e9',
  borderColor = 'rgba(255, 255, 255, 0.1)',
  maxRows = 10
}) => {
  const displayData = data.slice(0, maxRows);

  const formatValue = (value: any, format?: string) => {
    if (value === null || value === undefined) return '-';

    switch (format) {
      case 'currency':
        return typeof value === 'number' ? `£${value.toLocaleString()}` : value;
      case 'percentage':
        return typeof value === 'number' ? `${value}%` : value;
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : value;
      case 'date':
        return value instanceof Date ? value.toLocaleDateString() : value;
      default:
        return value;
    }
  };

  return (
    <div
      className="w-full h-full rounded-xl overflow-hidden flex flex-col"
      style={{
        backgroundColor,
        color: textColor,
        borderColor
      }}
    >
      <table className="w-full border-collapse flex-1">
        <thead>
          <tr className="bg-white/5 border-b border-white/10">
            {columns.map((column) => (
              <th
                key={column.key}
                className="p-4 text-xs font-semibold uppercase tracking-wide whitespace-nowrap max-md:p-3 max-md:text-[11px]"
                style={{
                  width: column.width,
                  textAlign: column.align || 'left',
                  color: headerColor
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayData.map((row, index) => (
            <tr key={index} className="transition-colors duration-200 border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="py-3.5 px-4 text-sm whitespace-nowrap overflow-hidden text-ellipsis max-md:p-3 max-md:text-xs"
                  style={{
                    textAlign: column.align || 'left'
                  }}
                >
                  {formatValue(row[column.key], column.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {displayData.length === 0 && (
        <div className="flex-1 flex items-center justify-center py-12 px-6 text-white/50 text-sm">
          <p>No data available</p>
        </div>
      )}
    </div>
  );
};

export default CleanTableCard;
