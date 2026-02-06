import React from 'react';
import { ShoppingCart, Package, DollarSign, FileText, User } from 'lucide-react';

export interface Activity {
  id: string;
  action: string;
  customerName: string;
  time: string;
  domain?: string | null;
  amount: number;
  created_at: string;
}

export interface ActivityFilter {
  id: string;
  label: string;
  value: string;
  active: boolean;
}

export interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
  color?: string;
  title?: string;
  subtitle?: string;
  maxActivities?: number;
  filters?: ActivityFilter[];
  onFilterChange?: (filters: ActivityFilter[]) => void;
  showFilters?: boolean;
}

// Function to determine if text should be light or dark based on background color
const getTextColor = (backgroundColor: string) => {
  // Convert hex to RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return white text for dark backgrounds, dark text for light backgrounds
  return luminance > 0.5 ? '#1a1f2a' : '#ffffff';
};

const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities = [],
  loading = false,
  color = '#79d5e9',
  title = 'Recent Activities',
  subtitle = 'Latest system events',
  maxActivities = 6,
  filters = [],
  onFilterChange,
  showFilters = false
}) => {
  const textColor = getTextColor(color);
  const secondaryColor = textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(26, 31, 42, 0.7)';

  // Filter activities based on active filters
  const filteredActivities = filters.length > 0 && filters.some(f => f.active)
    ? activities.filter(activity => {
        const activeFilters = filters.filter(f => f.active);
        return activeFilters.some(filter => {
          const activityType = activity.action.toLowerCase();
          return activityType.includes(filter.value.toLowerCase());
        });
      })
    : activities;

  const handleFilterClick = (filterId: string) => {
    if (onFilterChange) {
      const updatedFilters = filters.map(filter =>
        filter.id === filterId ? { ...filter, active: !filter.active } : filter
      );
      onFilterChange(updatedFilters);
    }
  };

  const getActivityTypeInfo = (activity: Activity) => {
    if (activity.action.toLowerCase().includes('delivered')) {
      return {
        icon: <Package size={16} color="white" />,
        bgColor: '#3b82f6',
        title: 'Order Delivered',
        showAmount: true
      };
    } else if (activity.action.toLowerCase().includes('order')) {
      return {
        icon: <ShoppingCart size={16} color="white" />,
        bgColor: '#22c55e',
        title: 'New Order',
        showAmount: true
      };
    } else if (activity.action.toLowerCase().includes('invoice')) {
      return {
        icon: <FileText size={16} color="white" />,
        bgColor: '#22c55e',
        title: 'Invoice Paid',
        showAmount: true
      };
    } else {
      return {
        icon: <User size={16} color="white" />,
        bgColor: '#64748b',
        title: 'User Logged In',
        showAmount: false
      };
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-xl p-4 h-full flex flex-col overflow-hidden min-h-[300px]"
        style={{
          background: color,
          color: textColor
        }}
      >
        <div className="pb-4 mb-5 flex justify-between items-start shrink-0">
          <h3 style={{ color: textColor }}>{title}</h3>
          <p style={{ color: secondaryColor }}>{subtitle}</p>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: secondaryColor }}>
          Loading activities...
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 h-full flex flex-col overflow-hidden min-h-[300px]"
      style={{
        background: color,
        color: textColor
      }}
    >
      <div
        className="pb-4 mb-5 flex justify-between items-start shrink-0"
        style={{
          borderBottom: `1px solid ${textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(26, 31, 42, 0.15)'}`
        }}
      >
        <div>
          <h3 className="m-0 text-lg font-semibold leading-[1.4]" style={{ color: textColor }}>{title}</h3>
          <p className="mt-1 mb-0 text-sm leading-[1.4]" style={{ color: secondaryColor }}>
            {subtitle}
          </p>
        </div>
      </div>

      {showFilters && filters.length > 0 && (
        <div
          className="px-4 py-3 bg-white/[0.02]"
          style={{
            borderBottom: `1px solid ${textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(26, 31, 42, 0.15)'}`
          }}
        >
          <div className="flex gap-2 flex-wrap">
            {filters.map(filter => (
              <button
                key={filter.id}
                className={`px-3 py-1.5 rounded-2xl text-xs cursor-pointer transition-all duration-200 outline-none bg-transparent hover:-translate-y-px ${filter.active ? 'font-semibold' : 'font-medium'}`}
                onClick={() => handleFilterClick(filter.id)}
                style={{
                  background: filter.active
                    ? (textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)')
                    : 'transparent',
                  color: filter.active ? textColor : secondaryColor,
                  border: `1px solid ${filter.active
                    ? (textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)')
                    : (textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')}`
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-none">
        {filteredActivities.slice(0, maxActivities).map((activity) => {
          const activityInfo = getActivityTypeInfo(activity);

          return (
            <div key={activity.id} className="relative mb-4 flex items-start gap-4 hover:-translate-y-px hover:opacity-95">
              {/* Content area with icon and card */}
              <div className="flex-1 flex flex-col gap-0">
                {/* Icon box positioned above the card */}
                <div
                  className="w-[72px] h-8 rounded-lg flex items-center justify-center mb-2 text-white text-base font-semibold shadow-sm z-[2] relative shrink-0"
                  style={{
                    background: activityInfo.bgColor
                  }}
                >
                  {activityInfo.icon}
                </div>

                {/* Activity card - full width */}
                <div
                  className="rounded-xl transition-all duration-200 relative flex-1 -mt-4 pt-4 group-hover:translate-x-0.5"
                  style={{
                    background: textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                    border: `1px solid ${textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`
                  }}
                >
                  <div className="px-6 py-4 flex justify-between items-start relative">
                    <div className="flex-1 flex flex-col gap-1 pr-[120px]">
                      <div className="text-sm font-semibold leading-[1.3]" style={{ color: textColor }}>
                        {activityInfo.title}
                      </div>
                      <div className="text-[13px] leading-[1.3]" style={{ color: secondaryColor }}>
                        {activity.customerName}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 absolute top-4 right-5">
                      {activityInfo.showAmount && activity.amount > 0 && (
                        <div className="text-base font-bold text-right" style={{ color: textColor }}>
                          £{activity.amount.toLocaleString()}
                        </div>
                      )}
                      {/* Time indicator in top right */}
                      <div
                        className="text-xs font-medium opacity-80"
                        style={{ color: secondaryColor }}
                      >
                        {activity.time.replace(' ago', '').replace('hours', 'hr').replace('hour', 'hr').replace('minutes', 'min').replace('minute', 'min')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredActivities.length === 0 && (
          <div className="text-center py-12 px-6 text-sm" style={{ color: secondaryColor }}>
            No recent activities
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
