import { orderService } from './orderService';
import { authService } from './authService';

export interface WarehouseNotification {
  id: string;
  company_id: string;
  order_id: string;
  notification_type: 'sent_to_packing' | 'packed' | 'delivery_booked' | 'delivered';
  message: string;
  sent_to_user_id?: string;
  sent_by_user_id?: string;
  read_at?: string;
  email_sent: boolean;
  email_sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WarehouseActivityLog {
  id: string;
  company_id: string;
  order_id: string;
  user_id?: string;
  action: string;
  previous_status?: string;
  new_status?: string;
  notes?: string;
  created_at: string;
}

// Interface for warehouse management - maps status to warehouse_status for compatibility
export interface OrderWithShipping {
  id: string;
  salesorder_number?: string;
  status?: string;
  warehouse_status?: string; // Alias for status in warehouse context
  customer_name?: string;
  total?: number;
  date?: string;
  order_date?: string;
  created_at?: string;
  shipment_status?: string | null;
  shipped_status?: string | null;
  delivery_date?: string | null;
  legacy_order_number?: string;
  customers?: {
    display_name?: string;
    trading_name?: string;
    company?: string;
  };
}

export const shippingService = {
  // Send order to packing
  // TODO: warehouse_status, sent_to_packing_at, sent_to_packing_by do not exist in new schema.
  // Currently updates order status to 'sent_to_packing'. A dedicated warehouse/shipping
  // workflow will need to be built in the backend API.
  async sendOrderToPacking(orderId: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await authService.getCachedAgent();
      if (!user) {
        return { success: false, message: 'User not authenticated' };
      }

      await orderService.update(Number(orderId), {
        status: 'sent_to_packing',
      });

      return { success: true, message: 'Order sent to packing successfully' };
    } catch (error) {
      console.error('Error sending order to packing:', error);
      return { success: false, message: 'Failed to send order to packing' };
    }
  },

  // Update order to packed status
  // TODO: warehouse_status, packed_at, packed_by do not exist in new schema.
  // Currently updates order status to 'packed'.
  async markOrderAsPacked(orderId: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await authService.getCachedAgent();
      if (!user) {
        return { success: false, message: 'User not authenticated' };
      }

      await orderService.update(Number(orderId), {
        status: 'packed',
      });

      return { success: true, message: 'Order marked as packed successfully' };
    } catch (error) {
      console.error('Error marking order as packed:', error);
      return { success: false, message: 'Failed to mark order as packed' };
    }
  },

  // Book delivery for order
  // TODO: warehouse_status, delivery_booked_at, delivery_booked_by do not exist in new schema.
  // Currently updates order status to 'delivery_booked'.
  async bookDelivery(orderId: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await authService.getCachedAgent();
      if (!user) {
        return { success: false, message: 'User not authenticated' };
      }

      await orderService.update(Number(orderId), {
        status: 'delivery_booked',
      });

      return { success: true, message: 'Delivery booked successfully' };
    } catch (error) {
      console.error('Error booking delivery:', error);
      return { success: false, message: 'Failed to book delivery' };
    }
  },

  // Mark order as delivered
  // TODO: warehouse_status does not exist in new schema.
  // Currently updates order status to 'delivered'.
  async markAsDelivered(orderId: string): Promise<{ success: boolean; message: string }> {
    try {
      await orderService.update(Number(orderId), {
        status: 'delivered',
      });

      return { success: true, message: 'Order marked as delivered successfully' };
    } catch (error) {
      console.error('Error marking order as delivered:', error);
      return { success: false, message: 'Failed to mark order as delivered' };
    }
  },

  // Get orders by warehouse status for current user's company
  // TODO: The new orders API does not have a warehouse_status filter.
  // The new schema does not have warehouse_status on orders at all.
  // This fetches all orders and returns empty buckets until a proper
  // warehouse workflow is implemented in the backend API.
  async getOrdersByWarehouseStatus(_companyId: string): Promise<{
    pending: OrderWithShipping[];
    sentToPacking: OrderWithShipping[];
    packed: OrderWithShipping[];
    deliveryBooked: OrderWithShipping[];
    delivered: OrderWithShipping[];
  }> {
    try {
      // TODO: Implement proper warehouse status filtering once the backend
      // supports warehouse workflow fields. For now, return empty arrays.
      return {
        pending: [],
        sentToPacking: [],
        packed: [],
        deliveryBooked: [],
        delivered: [],
      };
    } catch (error) {
      console.error('Error fetching orders by warehouse status:', error);
      return {
        pending: [],
        sentToPacking: [],
        packed: [],
        deliveryBooked: [],
        delivered: [],
      };
    }
  },

  // Get warehouse notifications for current user
  // TODO: warehouse_notifications table does not exist in the new Neon schema.
  // Returns empty array until warehouse notification system is implemented.
  async getWarehouseNotifications(_userId: string, _limit: number = 20): Promise<WarehouseNotification[]> {
    // TODO: Implement once warehouse_notifications table exists in the new schema
    return [];
  },

  // Mark notification as read
  // TODO: warehouse_notifications table does not exist in the new Neon schema.
  // Returns false until warehouse notification system is implemented.
  async markNotificationAsRead(_notificationId: string): Promise<boolean> {
    // TODO: Implement once warehouse_notifications table exists in the new schema
    return false;
  },

  // Get warehouse activity log for an order
  // TODO: warehouse_activity_log table does not exist in the new Neon schema.
  // Returns empty array until warehouse activity logging is implemented.
  async getWarehouseActivityLog(_orderId: string): Promise<WarehouseActivityLog[]> {
    // TODO: Implement once warehouse_activity_log table exists in the new schema
    return [];
  },

  // Get unread notification count
  // TODO: warehouse_notifications table does not exist in the new Neon schema.
  // Returns 0 until warehouse notification system is implemented.
  async getUnreadNotificationCount(_userId: string): Promise<number> {
    // TODO: Implement once warehouse_notifications table exists in the new schema
    return 0;
  },
};
