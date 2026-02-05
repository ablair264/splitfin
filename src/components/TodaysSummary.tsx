import React, { useState, useEffect, useRef } from 'react';
import { authService } from '../services/authService';
import { orderService } from '../services/orderService';
import { customerService } from '../services/customerService';
import { productService } from '../services/productService';
import { openaiService } from '../services/openaiService';
import { RefreshCw, Brain, AlertCircle, CheckCircle, X, ExternalLink } from 'lucide-react';
import './TodaysSummary.css';

interface TodaysSummaryProps {
  companyId: string;
}

interface SummaryData {
  content: string;
  timestamp: Date;
  refreshCount: number;
}

const TodaysSummary: React.FC<TodaysSummaryProps> = ({ companyId }) => {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailedSummary, setDetailedSummary] = useState<string | null>(null);
  const [detailedLoading, setDetailedLoading] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxRefreshes = 5;
  const refreshInterval = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Load today's business context for AI
  const loadTodaysBusinessContext = async () => {
    try {
      const agent = authService.getCachedAgent();
      if (!agent) {
        throw new Error('User not authenticated');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get data from services - these use the new backend API pattern
      const [ordersData, customersData, productsData] = await Promise.all([
        orderService.list({ limit: 100 }),
        customerService.list({ limit: 100 }),
        productService.list({ limit: 100 })
      ]);

      // Filter for today's data (client-side since we don't have date filters in API yet)
      const todayOrders = ordersData.data.filter(order => {
        const orderDate = new Date(order.created_at || '');
        return orderDate >= today;
      });

      const todayCustomers = customersData.data.filter(customer => {
        const createdDate = new Date(customer.created_at || '');
        return createdDate >= today;
      });

      const todayRevenueTotal = todayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
      const pendingOrders = ordersData.data.filter(o => o.status === 'pending');
      const lowStockItems = productsData.data.filter(p => (p.stock_on_hand || 0) < 10);

      // Get recent orders with customer info
      const recentOrdersToday = todayOrders.slice(0, 5).map(order => ({
        ...order,
        customers: customersData.data.find(c => String(c.id) === order.zoho_customer_id)
      }));

      return {
        customerCount: customersData.data.length,
        orderCount: ordersData.data.length,
        productCount: productsData.data.length,
        recentOrders: recentOrdersToday,
        topProducts: lowStockItems.slice(0, 5),
        companyId,
        // Additional today-specific data
        todayOrders: todayOrders.length,
        todayRevenue: todayRevenueTotal,
        todayCustomers: todayCustomers.length,
        recentOrdersToday,
        lowStockItems: lowStockItems.slice(0, 5),
        pendingOrders: pendingOrders.length
      };
    } catch (error) {
      console.error('Error loading today\'s business context:', error);
      throw error;
    }
  };

  // Generate AI summary
  const generateSummary = async () => {
    if (refreshCount >= maxRefreshes) {
      console.log('Maximum refresh count reached, stopping auto-refresh');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const todaysContext = await loadTodaysBusinessContext();

      // Create a focused prompt for today's summary
      const summaryPrompt = `Generate a concise business summary for TODAY ONLY. Use this specific data:

TODAY'S METRICS:
- Orders today: ${todaysContext.todayOrders}
- Revenue today: £${todaysContext.todayRevenue.toFixed(2)}
- New customers today: ${todaysContext.todayCustomers}
- Pending orders: ${todaysContext.pendingOrders}
- Low stock items: ${todaysContext.lowStockItems.length}

RECENT ORDERS TODAY:
${todaysContext.recentOrdersToday.map(order => `- ${order.id}: £${order.total} (${order.customers?.company_name || 'Unknown'})`).join('\n')}

LOW STOCK ALERTS:
${todaysContext.lowStockItems.map(item => `- ${item.name}: ${item.stock_on_hand} units left`).join('\n')}

Focus on:
1. Today's performance vs yesterday/typical day
2. Immediate action items for today
3. Urgent alerts (low stock, pending orders)
4. Today's highlights and achievements
5. What to focus on for the rest of today

Keep it under 150 words, professional, and actionable for TODAY.`;

      const aiResponse = await openaiService.generateResponse(
        summaryPrompt,
        todaysContext,
        []
      );

      const newSummary: SummaryData = {
        content: aiResponse,
        timestamp: new Date(),
        refreshCount: refreshCount + 1
      };

      setSummary(newSummary);
      setRefreshCount(prev => prev + 1);

      console.log(`Today's summary generated (refresh ${refreshCount + 1}/${maxRefreshes})`);
    } catch (error) {
      console.error('Error generating summary:', error);
      setError('Failed to generate summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Manual refresh
  const handleManualRefresh = () => {
    if (refreshCount < maxRefreshes) {
      generateSummary();
    }
  };

  // Generate detailed summary for modal
  const generateDetailedSummary = async () => {
    setDetailedLoading(true);
    try {
      const todaysContext = await loadTodaysBusinessContext();

      // Get this week's data for comparison
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      // Get all orders and filter for week data
      const allOrders = await orderService.list({ limit: 500 });
      const weekOrders = allOrders.data.filter(order => {
        const orderDate = new Date(order.created_at || '');
        return orderDate >= weekStart;
      });

      const weekRevenueTotal = weekOrders.reduce((sum, order) => sum + (order.total || 0), 0);
      const weekOrdersCount = weekOrders.length;

      const allCustomers = await customerService.list({ limit: 500 });
      const weekCustomers = allCustomers.data.filter(customer => {
        const createdDate = new Date(customer.created_at || '');
        return createdDate >= weekStart;
      });
      const weekCustomersCount = weekCustomers.length;

      const detailedPrompt = `Generate a comprehensive business intelligence report for TODAY and THIS WEEK. Use this data:

TODAY'S PERFORMANCE:
- Orders: ${todaysContext.todayOrders} (Revenue: £${todaysContext.todayRevenue.toFixed(2)})
- New customers: ${todaysContext.todayCustomers}
- Pending orders: ${todaysContext.pendingOrders}
- Low stock items: ${todaysContext.lowStockItems.length}

THIS WEEK'S PERFORMANCE:
- Orders: ${weekOrdersCount} (Revenue: £${weekRevenueTotal.toFixed(2)})
- New customers: ${weekCustomersCount}

RECENT ORDERS TODAY:
${todaysContext.recentOrdersToday.map(order => `- ${order.id}: £${order.total} (${order.customers?.company_name || 'Unknown'})`).join('\n')}

LOW STOCK ALERTS:
${todaysContext.lowStockItems.map(item => `- ${item.name}: ${item.stock_on_hand} units left`).join('\n')}

Provide detailed analysis including:
1. Performance trends and comparisons
2. Key insights and patterns
3. Actionable recommendations
4. Risk assessments
5. Opportunities for growth
6. Operational efficiency metrics
7. Customer behavior insights
8. Inventory optimization suggestions

Format as a professional business report with clear sections and actionable insights.`;

      const aiResponse = await openaiService.generateResponse(
        detailedPrompt,
        todaysContext,
        []
      );

      setDetailedSummary(aiResponse);
    } catch (error) {
      console.error('Error generating detailed summary:', error);
    } finally {
      setDetailedLoading(false);
    }
  };

  // Modal handlers
  const handleOpenModal = () => {
    setIsModalOpen(true);
    if (!detailedSummary) {
      generateDetailedSummary();
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Initialize and set up auto-refresh
  useEffect(() => {
    // Generate initial summary
    generateSummary();

    // Set up auto-refresh interval
    intervalRef.current = setInterval(() => {
      if (refreshCount < maxRefreshes && isVisible) {
        generateSummary();
      }
    }, refreshInterval);

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [companyId, isVisible]);

  // Stop auto-refresh when max refreshes reached
  useEffect(() => {
    if (refreshCount >= maxRefreshes && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [refreshCount]);

  // Pause auto-refresh when component is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const canRefresh = refreshCount < maxRefreshes;

  return (
    <>
      <div className="todays-summary-compact">
        <div className="summary-header">
          <div className="summary-title">
            <Brain size={16} />
            <h3>AI Insights</h3>
          </div>
          <div className="summary-controls">
            <button
              className={`refresh-btn ${!canRefresh ? 'disabled' : ''}`}
              onClick={handleManualRefresh}
              disabled={!canRefresh || loading}
              title={canRefresh ? 'Refresh summary' : 'Maximum refreshes reached'}
            >
              <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            </button>
            <button
              className="expand-btn"
              onClick={handleOpenModal}
              title="View detailed insights"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        </div>

        <div className="summary-content-compact">
          {loading && !summary && (
            <div className="loading-state-compact">
              <RefreshCw size={16} className="spinning" />
              <span>Generating insights...</span>
            </div>
          )}

          {error && (
            <div className="error-state-compact">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {summary && !loading && !error && (
            <div className="summary-text-compact">
              <div className="summary-preview">
                {summary.content.split('\n').slice(0, 3).map((line, index) => {
                  if (line.trim() === '') return <br key={index} />;

                  // Handle bullet points
                  if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
                    return (
                      <div key={index} className="summary-bullet-compact">
                        {line.trim()}
                      </div>
                    );
                  }

                  // Handle headers (lines with **text**)
                  if (line.includes('**') && line.trim().length < 50) {
                    const cleanLine = line.replace(/\*\*/g, '');
                    return (
                      <div key={index} className="summary-header-compact">
                        {cleanLine}
                      </div>
                    );
                  }

                  // Regular text
                  return (
                    <div key={index} className="summary-line-compact">
                      {line.length > 100 ? line.substring(0, 100) + '...' : line}
                    </div>
                  );
                })}
                <div className="read-more-hint">
                  Click to view detailed insights →
                </div>
              </div>
            </div>
          )}

          {!summary && !loading && !error && (
            <div className="empty-state-compact">
              <CheckCircle size={16} />
              <span>No insights available yet</span>
            </div>
          )}
        </div>

        <div className="summary-footer">
          <span className="last-updated-compact">
            {summary ? `Updated ${formatTime(summary.timestamp)}` : ''}
          </span>
          <span className="refresh-count-compact">
            {refreshCount}/{maxRefreshes}
          </span>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="summary-modal-overlay" onClick={handleCloseModal}>
          <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detailed AI Insights</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-content">
              {detailedLoading ? (
                <div className="modal-loading">
                  <RefreshCw size={24} className="spinning" />
                  <p>Generating detailed insights...</p>
                </div>
              ) : detailedSummary ? (
                <div className="detailed-summary">
                  {detailedSummary.split('\n').map((line, index) => {
                    if (line.trim() === '') return <br key={index} />;

                    // Handle bullet points
                    if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
                      return (
                        <div key={index} className="detailed-bullet">
                          {line.trim()}
                        </div>
                      );
                    }

                    // Handle headers (lines with **text**)
                    if (line.includes('**') && line.trim().length < 100) {
                      const cleanLine = line.replace(/\*\*/g, '');
                      return (
                        <div key={index} className="detailed-header">
                          {cleanLine}
                        </div>
                      );
                    }

                    // Regular text
                    return (
                      <div key={index} className="detailed-paragraph">
                        {line}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="modal-error">
                  <AlertCircle size={24} />
                  <p>Failed to load detailed insights</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TodaysSummary;
