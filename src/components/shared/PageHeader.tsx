import { Link } from '@/components/ui/link';
import { Breadcrumbs, BreadcrumbsItem } from '@/components/ui/breadcrumbs';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, count, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="space-y-1">
      {/* Row 1: Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs className="text-sm">
          {breadcrumbs.map((crumb, i) => (
            <BreadcrumbsItem
              key={crumb.label}
              href={i < breadcrumbs.length - 1 ? crumb.href : undefined}
            >
              {crumb.label}
            </BreadcrumbsItem>
          ))}
        </Breadcrumbs>
      )}

      {/* Row 2: Title + Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {(count !== undefined || subtitle) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {count !== undefined ? count.toLocaleString() : ''}{count !== undefined && subtitle ? ' ' : ''}{subtitle || ''}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
