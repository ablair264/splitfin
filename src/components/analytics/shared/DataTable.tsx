import React from 'react';
import styles from './DataTable.module.css';

export interface TableColumn<T> {
  key: string;
  header: string;
  width?: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyState?: {
    icon?: React.ReactNode;
    title: string;
    description?: string;
  };
  className?: string;
  loading?: boolean;
  title?: string;
  viewAllLink?: {
    label?: string;
    onClick: () => void;
  };
}

function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyState,
  className = '',
  loading = false,
  title,
  viewAllLink
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={`${styles.dataTableContainer} ${className}`}>
        {(title || viewAllLink) && (
          <div className={styles.tableTitleSection}>
            {title && <h2 className={styles.tableTitle}>{title}</h2>}
            {viewAllLink && (
              <button className={styles.viewAllLink} onClick={viewAllLink.onClick}>
                {viewAllLink.label || 'View All'}
              </button>
            )}
          </div>
        )}
        <div className={`${styles.dataTable} ${styles.loading}`}>
          <div className={styles.tableHeader}>
            <div className={styles.tableRow}>
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={`${styles.tableCell} ${column.className || ''}`}
                  style={{ width: column.width }}
                >
                  <div className={styles.skeletonText} style={{ width: '60%' }}></div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.tableBody}>
            {[...Array(5)].map((_, index) => (
              <div key={index} className={styles.tableRow}>
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className={`${styles.tableCell} ${column.className || ''}`}
                    style={{ width: column.width }}
                  >
                    <div className={styles.skeletonText}></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.dataTableContainer} ${className}`}>
      {(title || viewAllLink) && (
        <div className={styles.tableTitleSection}>
          {title && <h2 className={styles.tableTitle}>{title}</h2>}
          {viewAllLink && (
            <button className={styles.viewAllLink} onClick={viewAllLink.onClick}>
              {viewAllLink.label || 'View All'}
            </button>
          )}
        </div>
      )}
      <div className={styles.dataTable}>
        <div className={styles.tableHeader}>
          <div className={styles.tableRow}>
            {columns.map((column) => (
              <div
                key={column.key}
                className={`${styles.tableCell} ${styles.headerCell} ${column.className || ''}`}
                style={{ width: column.width }}
              >
                {column.header}
              </div>
            ))}
          </div>
        </div>
        
        <div className={styles.tableBody}>
          {data.length === 0 ? (
            <div className={styles.emptyState}>
              {emptyState?.icon && (
                <div className={styles.emptyIcon}>{emptyState.icon}</div>
              )}
              <h3>{emptyState?.title || 'No data found'}</h3>
              {emptyState?.description && (
                <p>{emptyState.description}</p>
              )}
            </div>
          ) : (
            data.map((item) => (
              <div
                key={keyExtractor(item)}
                className={`${styles.tableRow} ${onRowClick ? styles.clickable : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className={`${styles.tableCell} ${column.className || ''}`}
                    style={{ width: column.width }}
                  >
                    {column.render
                      ? column.render(item)
                      : (item as any)[column.key]}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default DataTable;