import React, { useEffect, useState } from 'react';
import { ShoppingCart, Package, DollarSign, FileText, User } from 'lucide-react';
import { orderService } from '../../services/orderService';
import { customerService } from '../../services/customerService';
import { authService } from '../../services/authService';
import styles from './ActivityCard.module.css';

export interface Activity {
  id: string;
  action: string;
  customerName: string;
  time: string;
  domain?: string | null;
  amount: number;
  created_at: string;
}

export interface ActivityCardProps {
  maxActivities?: number;
  className?: string;
}

const ActivityCard: React.FC<ActivityCardProps> = ({
  maxActivities = 6,
  className = ''
}) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      setLoading(true);

      // Get current agent from authService
      const agent = authService.getCachedAgent();
      if (!agent) {
        setError('Not authenticated');
        return;
      }

      // Get recent orders using orderService
      const ordersResponse = await orderService.list({
        limit: maxActivities * 2, // Get more than we need to filter different types
      });

      const ordersData = ordersResponse.data || [];

      // Get customer IDs from orders for name lookup
      const customerIds = [...new Set(ordersData.map(order => order.zoho_customer_id).filter(Boolean))];

      // Build a map of customer names
      const customerMap = new Map<string, string>();

      // Fetch customer details for name mapping
      if (customerIds.length > 0) {
        try {
          const customersResponse = await customerService.list({ limit: 100 });
          const customers = customersResponse.data || [];
          customers.forEach(customer => {
            if (customer.zoho_contact_id) {
              customerMap.set(customer.zoho_contact_id, customer.company_name || 'Unknown Customer');
            }
          });
        } catch (customerError) {
          console.log('Could not fetch customer names:', customerError);
        }
      }

      // Transform orders into activities
      // Field mappings: order_status -> status, order_date -> date, legacy_order_number -> salesorder_number, display_name/trading_name -> company_name
      const orderActivities: Activity[] = ordersData.map(order => {
        const customerName = customerMap.get(order.zoho_customer_id || '') || 'Unknown Customer';
        return {
          id: String(order.id),
          action: order.status === 'delivered' ? 'Order Delivered' : 'New Order',
          customerName,
          time: formatTimeAgo(order.date || order.created_at),
          amount: Number(order.total) || 0,
          created_at: order.date || order.created_at
        };
      });

      // Use only real order activities
      const allActivities = orderActivities
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, maxActivities);

      setActivities(allActivities);
    } catch (error) {
      console.error('Error loading activities:', error);
      setError('Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
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
        title: 'User Activity',
        showAmount: false
      };
    }
  };

  if (loading) {
    return (
      <div className={`${styles.activityCardContainer} ${className}`}>
        <div className={styles.cardHeader}>
          <h3>Recent Activities</h3>
          <p>Latest system events</p>
        </div>
        <div className={styles.loadingState}>
          Loading activities...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.activityCardContainer} ${className}`}>
        <div className={styles.cardHeader}>
          <h3>Recent Activities</h3>
          <p>Latest system events</p>
        </div>
        <div className={styles.errorState}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.activityCardContainer} ${className}`}>
      <div className={styles.activitiesSimple}>
        {activities.map((activity) => {
          const activityInfo = getActivityTypeInfo(activity);

          return (
            <div key={activity.id} className={styles.activityItem}>
              <div className={styles.activityContent}>
                <div
                  className={styles.activityIcon}
                  style={{
                    background: activityInfo.bgColor
                  }}
                >
                  {activityInfo.icon}
                </div>

                <div className={styles.activityCard}>
                  <div className={styles.activityMain}>
                    <div className={styles.activityInfo}>
                      <div className={styles.activityTitle}>
                        {activityInfo.title}
                      </div>
                      <div className={styles.activityCompany}>
                        {activity.customerName}
                      </div>
                    </div>
                    <div className={styles.activityRight}>
                      {activityInfo.showAmount && activity.amount > 0 && (
                        <div className={styles.activityAmount}>
                          £{activity.amount.toLocaleString()}
                        </div>
                      )}
                      <div className={styles.activityTime}>
                        {activity.time.replace(' ago', '').replace('hours', 'hr').replace('hour', 'hr').replace('minutes', 'min').replace('minute', 'min')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {activities.length === 0 && (
          <div className={styles.emptyState}>
            No recent activities
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityCard;
