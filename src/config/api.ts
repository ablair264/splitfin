// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH_LOGIN: `${API_BASE_URL}/api/v1/auth/login`,
  AUTH_ME: `${API_BASE_URL}/api/v1/auth/me`,
  AUTH_LOGOUT: `${API_BASE_URL}/api/v1/auth/logout`,

  // Customer endpoints
  CUSTOMERS: `${API_BASE_URL}/api/v1/customers`,
  CUSTOMER_COUNT: `${API_BASE_URL}/api/v1/customers/count`,

  // Product endpoints
  PRODUCTS: `${API_BASE_URL}/api/v1/products`,
  PRODUCT_COUNT: `${API_BASE_URL}/api/v1/products/count`,

  // Order endpoints
  ORDERS: `${API_BASE_URL}/api/v1/orders`,
  ORDER_COUNT: `${API_BASE_URL}/api/v1/orders/count`,

  // Invoice endpoints
  INVOICES: `${API_BASE_URL}/api/v1/invoices`,

  // Notification endpoints
  NOTIFICATIONS: `${API_BASE_URL}/api/v1/notifications`,

  // Analytics endpoints
  ANALYTICS: `${API_BASE_URL}/api/v1/analytics`,
  ANALYTICS_DASHBOARD: `${API_BASE_URL}/api/v1/analytics/dashboard`,

  // Image endpoints
  IMAGES: `${API_BASE_URL}/api/v1/images`,
  IMAGE_UPLOAD: `${API_BASE_URL}/api/v1/images/upload`,

  // AI endpoints (proxied through backend)
  AI: `${API_BASE_URL}/api/ai`,

  // Sync endpoints
  SYNC: `${API_BASE_URL}/api/sync`,
};
