import { api } from './apiClient';
import { orderService } from './orderService';
import { customerService } from './customerService';
import { productService } from './productService';
import { invoiceService } from './invoiceService';

export interface ChatbotKnowledge {
  id?: number;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
  company_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatConversation {
  id?: number;
  user_id: string;
  message: string;
  response: string;
  session_id: string;
  company_id: string;
  created_at?: string;
}

export const chatbotService = {
  // Knowledge base operations
  // TODO: chatbot_knowledge table does not exist in Neon yet
  async getKnowledgeBase(_companyId?: string): Promise<ChatbotKnowledge[]> {
    // TODO: Implement when chatbot_knowledge table is created in Neon
    return [];
  },

  // TODO: chatbot_knowledge table does not exist in Neon yet
  async searchKnowledge(_query: string, _companyId?: string): Promise<ChatbotKnowledge[]> {
    // TODO: Implement when chatbot_knowledge table is created in Neon
    return [];
  },

  // TODO: chatbot_knowledge table does not exist in Neon yet
  async addKnowledge(_knowledge: Omit<ChatbotKnowledge, 'id' | 'created_at' | 'updated_at'>): Promise<ChatbotKnowledge> {
    // TODO: Implement when chatbot_knowledge table is created in Neon
    throw new Error('chatbot_knowledge table not yet available in Neon');
  },

  // Conversation logging
  // TODO: chatbot_conversations table does not exist in Neon yet
  async logConversation(_conversation: Omit<ChatConversation, 'id' | 'created_at'>): Promise<ChatConversation> {
    // TODO: Implement when chatbot_conversations table is created in Neon
    throw new Error('chatbot_conversations table not yet available in Neon');
  },

  // Business data queries
  async getCustomerCount(_companyId: string): Promise<number> {
    try {
      return await customerService.count('active');
    } catch (error) {
      console.error('Chatbot: Error in getCustomerCount:', error);
      throw error;
    }
  },

  async getOrderCount(_companyId: string): Promise<number> {
    try {
      return await orderService.count({});
    } catch (error) {
      console.error('Chatbot: Error in getOrderCount:', error);
      throw error;
    }
  },

  // Time-filtered data queries
  // TODO: orderService.count does not support date filtering yet
  async getOrderCountThisWeek(_companyId: string): Promise<number> {
    try {
      // TODO: Add date filtering support to orderService.count
      return await orderService.count({});
    } catch (error) {
      console.error('Chatbot: Error in getOrderCountThisWeek:', error);
      throw error;
    }
  },

  // TODO: orderService.count does not support date filtering yet
  async getOrderCountThisMonth(_companyId: string): Promise<number> {
    try {
      // TODO: Add date filtering support to orderService.count
      return await orderService.count({});
    } catch (error) {
      console.error('Chatbot: Error in getOrderCountThisMonth:', error);
      throw error;
    }
  },

  // TODO: orderService.list does not support date filtering yet
  async getRecentOrdersThisWeek(_companyId: string, limit: number = 5) {
    try {
      // TODO: Add date filtering support to orderService.list
      const result = await orderService.list({ limit });
      return result.data.map(order => ({
        ...order,
        total_amount: order.total,
        status: order.status
      }));
    } catch (error) {
      console.error('Chatbot: Error in getRecentOrdersThisWeek:', error);
      throw error;
    }
  },

  // TODO: orderService.list does not support date filtering yet
  async getRecentOrdersThisMonth(_companyId: string, limit: number = 5) {
    try {
      // TODO: Add date filtering support to orderService.list
      const result = await orderService.list({ limit });
      return result.data.map(order => ({
        ...order,
        total_amount: order.total,
        status: order.status
      }));
    } catch (error) {
      console.error('Chatbot: Error in getRecentOrdersThisMonth:', error);
      throw error;
    }
  },

  async getProductCount(_companyId: string): Promise<number> {
    try {
      return await productService.count({});
    } catch (error) {
      console.error('Chatbot: Error in getProductCount:', error);
      throw error;
    }
  },

  async getRecentOrders(_companyId: string, limit: number = 5) {
    try {
      const result = await orderService.list({ limit });
      return result.data.map(order => ({
        ...order,
        total_amount: order.total,
        status: order.status
      }));
    } catch (error) {
      console.error('Chatbot: Error in getRecentOrders:', error);
      throw error;
    }
  },

  async getTopProducts(_companyId: string, limit: number = 5) {
    try {
      const result = await productService.list({ limit });
      return result.data.map(item => ({
        product_name: item.name,
        stock_quantity: item.stock_on_hand,
        unit_price: item.rate
      }));
    } catch (error) {
      console.error('Chatbot: Error in getTopProducts:', error);
      throw error;
    }
  },

  async getOrderByNumber(orderNumber: string, _companyId: string) {
    try {
      // Clean up the order number - remove common prefixes and # symbols
      const cleanOrderNumber = orderNumber.replace(/^#/, '').replace(/^SO-/i, '').trim();

      console.log('Chatbot: Searching for order:', cleanOrderNumber);

      const result = await orderService.list({ search: cleanOrderNumber, limit: 1 });
      const order = result.data[0] || null;

      if (!order) {
        console.log('Chatbot: No order found with number:', orderNumber);
        return null;
      }

      console.log('Chatbot: Order found:', order.salesorder_number || order.id);

      return {
        ...order,
        total_amount: order.total,
        status: order.status,
        items: order.line_items || [],
        customers: {
          display_name: order.customer_name,
          company: order.customer_name
        }
      };
    } catch (error) {
      console.error('Chatbot: Critical error in getOrderByNumber:', error);
      throw error;
    }
  },

  // Enquiry queries
  // TODO: No enquiries table in Neon
  async getEnquiries(_companyId: string, _status?: string, _limit: number = 10) {
    // TODO: Implement when enquiries table is created in Neon
    return [];
  },

  // Invoice queries
  async getInvoices(_companyId: string, status?: string, limit: number = 10) {
    try {
      const filters: Record<string, string | number> = { limit };
      if (status) {
        filters.status = status;
      }
      const result = await invoiceService.list(filters);
      return result.data;
    } catch (error) {
      console.error('Chatbot: Error in getInvoices:', error);
      throw error;
    }
  },

  async getOverdueInvoices(_companyId: string) {
    try {
      const result = await invoiceService.list({ status: 'overdue' });
      return result.data;
    } catch (error) {
      console.error('Chatbot: Error in getOverdueInvoices:', error);
      throw error;
    }
  },

  // Shipment queries
  // TODO: No shipments endpoint in the backend API yet
  async getShipments(_companyId: string, _status?: string, _limit: number = 10) {
    // TODO: Implement when shipments endpoint is available
    return [];
  },

  // Brand performance
  // TODO: brand_trends_aggregated table does not exist in Neon
  async getBrandPerformance(_companyId: string, _brandId?: string) {
    // TODO: Implement when brand_trends_aggregated table is created in Neon
    return [];
  },

  // Inventory metrics
  // TODO: inventory_metrics_aggregated table does not exist in Neon
  async getInventoryMetrics(_companyId: string) {
    // TODO: Implement when inventory_metrics_aggregated table is created in Neon
    return null;
  },

  // Low stock items
  // TODO: Backend API does not support stock level filtering yet
  async getLowStockItems(_companyId: string, _limit: number = 10) {
    // TODO: Implement when backend API supports stock level filtering
    return [];
  },

  // Sales performance
  // TODO: sales_performance_aggregated table does not exist in Neon
  async getSalesPerformance(_companyId: string, _periodType: string = 'month') {
    // TODO: Implement when sales_performance_aggregated table is created in Neon
    return [];
  },

  // Customer analytics
  async getTopCustomers(_companyId: string, limit: number = 5) {
    try {
      const result = await customerService.list({ limit });
      return result.data.map(customer => ({
        customer_id: customer.id,
        total_spent: customer.total_spent || 0,
        order_count: 0, // TODO: Not available from customerService.list
        customers: {
          display_name: customer.company_name,
          company: customer.company_name
        }
      }));
    } catch (error) {
      console.error('Chatbot: Error in getTopCustomers:', error);
      throw error;
    }
  },

  // Purchase orders
  // TODO: purchase_orders table does not exist in Neon
  async getPurchaseOrders(_companyId: string, _status?: string, _limit: number = 10) {
    // TODO: Implement when purchase_orders table is created in Neon
    return [];
  },

  // Backorders
  // TODO: backorders table does not exist in Neon
  async getBackorders(_companyId: string) {
    // TODO: Implement when backorders table is created in Neon
    return [];
  },

  // Search customers
  async searchCustomers(_companyId: string, searchTerm: string) {
    try {
      const result = await customerService.list({ search: searchTerm, limit: 10 });
      return result.data.map(customer => ({
        ...customer,
        display_name: customer.company_name,
        trading_name: customer.company_name,
        is_active: customer.status === 'active'
      }));
    } catch (error) {
      console.error('Chatbot: Error in searchCustomers:', error);
      throw error;
    }
  },

  // Search products
  async searchProducts(_companyId: string, searchTerm: string) {
    try {
      const result = await productService.list({ search: searchTerm, limit: 10 });
      return result.data;
    } catch (error) {
      console.error('Chatbot: Error in searchProducts:', error);
      throw error;
    }
  }
};
