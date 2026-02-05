/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate, Routes, Route } from 'react-router-dom';
import {
  ChartLine, UsersGroup, Clipboard, Store, Cart, Cog,
  Logout, ChevronDown, ChevronRight, Plus, Key, Menu, X, Map,
  UserPlus, Mail, Bell, File, User, QuestionCircle,
  Home, Database, Shield, Package, Box, Image, Book,
  Dollar, Calendar, Cloud, Truck
} from '@mynaui/icons-react';
import { authService } from '../services/authService';
import { customerService } from '../services/customerService';
import { notificationService } from '../services/notificationService';
import { analyticsPageService, AnalyticsPage } from '../services/analyticsPageService';
import type { Agent } from '../types/domain';
import './MasterLayout.css';
import Dashboard from '../components/Dashboard';
import Analytics from '../components/analytics/Analytics';
import NewPageModal from '../components/analytics/NewPageModal';
import CustomersManagement from '../components/CustomersManagement';
import CustomerDetail from '../components/CustomerDetail';
import CustomerMap from '../components/CustomerMap';

import EnquiryList from '../components/EnquiryList';
import ViewEnquiry from '../components/ViewEnquiry';
import OfflineStatus from '../components/OfflineStatus';
import { ProgressLoader } from '../components/ProgressLoader';
import { useLoader } from '../contexts/LoaderContext';
import NewAllProducts from '../components/NewAllProducts';
import BrandSelector from '../components/BrandSelector';
import OrderSummary from '../components/OrderSummary';
import OrderConfirmation from '../components/OrderConfirmation';
import OrderDetail from '../components/OrderDetail';
import NewOrder from '../components/NewOrder';
import ViewOrders from '../components/ViewOrders';
import OrderManagement from '../components/OrderManagement';
import ViewOrder from '../components/ViewOrder';
import InventoryOverview from '../components/inventory/InventoryOverview';
import InventoryProducts from '../components/InventoryManagement/InventoryProducts';
import CataloguesLanding from '../components/CataloguesLanding';
import ImageManagement from '../components/ImageManagement/ImageManagement';
import Settings from '../components/Settings/Settings';
import ProductList from '../components/ProductList/ProductList';
import BarcodeScannerApp from '../components/BarcodeScannerApp';
import AirtableDemo from '../components/AirtableDemo';
import Messaging from '../components/Messaging/Messaging';

import Warehouse from '../components/Warehouse';
import Couriers from '../components/Couriers';
import Deliveries from '../components/Deliveries';

// Use File for catalogue
const FaCatalogue = File;

// Icon mapping for custom analytics pages
const iconMapping: Record<string, React.ReactNode> = {
  users: <UsersGroup />,
  orders: <Clipboard />,
  invoices: <File />,
  sales: <User />,
  admin: <Database />,
  finance: <Dollar />,
  overview: <Home />,
  analytics: <ChartLine />,
  settings: <Cog />,
  cart: <Cart />,
  inventory: <Store />,
  calendar: <Calendar />,
  mail: <Mail />,
  notifications: <Bell />
};

type Section = 'Dashboard' | 'Analytics' | 'Customers' | 'Enquiries' | 'Orders' | 'Inventory' | 'Shipping' | 'Finance' | 'Suppliers' | 'Image Management' | 'Messaging' | 'Settings';

interface NavLink {
  to: string;
  label: string;
  icon?: React.ReactNode;
}

// Agent-based permissions: admins see everything, regular agents see core sales sections
const getAgentPermissions = (agent: Agent) => ({
  isAdmin: agent.is_admin,
  orders: true,
  finance: agent.is_admin,
  analytics: agent.is_admin,
  customers: true,
  inventory: agent.is_admin,
  marketing: agent.is_admin,
  catalogues: agent.is_admin,
  purchasing: agent.is_admin,
  imageManagement: agent.is_admin,
  salesManagement: true,
  customerManagement: true,
  suppliers: agent.is_admin,
});

const brands = [
  { name: 'Elvang', path: 'elvang', id: 'elvang' },
  { name: 'My Flame Lifestyle', path: 'my-flame-lifestyle', id: 'my-flame-lifestyle' },
  { name: 'PPD', path: 'ppd', id: 'ppd' },
  { name: 'Räder', path: 'rader', id: 'rader' },
  { name: 'Remember', path: 'remember', id: 'remember' },
  { name: 'Relaxound', path: 'relaxound', id: 'relaxound' },
];

// Settings Dropdown Component
function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="settings-dropdown-wrapper" ref={dropdownRef}>
      <button 
        className="master-sidebar-action-btn settings-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Settings"
      >
        <Cog />
      </button>
      
      {isOpen && (
        <div className="settings-dropdown">
          <button onClick={() => { navigate('/profile'); setIsOpen(false); }} className="settings-option">
            <User /> Profile
          </button>
          <button onClick={() => { navigate('/help'); setIsOpen(false); }} className="settings-option">
            <QuestionCircle /> Help
          </button>
        </div>
      )}
    </div>
  );
}

function Breadcrumbs({ customerNames, analyticsPageNames }: { customerNames: Record<string, string>, analyticsPageNames: Record<string, string> }) {
  const location = useLocation();
  
  const generateBreadcrumbs = () => {
    const pathnames = location.pathname.split('/').filter((x) => x);

    // On dashboard, just show "Home"
    if (pathnames.length === 0 || (pathnames.length === 1 && pathnames[0] === 'dashboard')) {
      return [{ name: 'Home', to: '/dashboard', isLast: true }];
    }
    
    const breadcrumbNameMap: { [key: string]: string } = {
      dashboard: 'Dashboard',
      customers: 'Customers',
      enquiries: 'Enquiries',
      'new': 'Create Customer',
      orders: 'Orders',
      approval: 'Approvals',
      invoices: 'Invoices',
      inventory: 'Inventory',
      products: 'Products',
      images: 'Image Management',
      items: 'Items',
      edit: 'Edit',
      brand: 'Brands',
      'select-brand': 'Select Brand',
      'order-summary': 'Order Summary',
      'order-confirmation': 'Order Confirmation',
      'order-detail': 'Order Detail',
      blomus: 'Blomus',
      elvang: 'Elvang',
      'my-flame-lifestyle': 'My Flame',
      myflamelifestyle: 'My Flame Lifestyle',
      gefu: 'GEFU',
      ppd: 'PPD',
      rader: 'Räder',
      remember: 'Remember',
      relaxound: 'Relaxound',
      'purchase-orders': 'Purchase Orders',
      'order-management': 'Order Management',
      'purchase-suggestions': 'Purchase Assistant',
      reports: 'Reports',
      saved: 'Saved Reports',
      templates: 'Report Templates',
      agents: 'Agent Management',
      settings: 'Settings',
      profile: 'Profile',
      help: 'Help',
      map: 'Customer Map',
      management: 'Account Management',
      'catalogue-library': 'Catalogue Library',
      catalogues: 'Catalogue Library',
      'catalogue-builder': 'Catalogue Builder',
      airtable: 'Airtable Integration'
    };
    
    return pathnames.map((value, index) => {
      const to = `/${pathnames.slice(0, index + 1).join('/')}`;
      const isLast = index === pathnames.length - 1;
      
      // Special handling for customer IDs in breadcrumbs
      let name = breadcrumbNameMap[value] || value.charAt(0).toUpperCase() + value.slice(1);
      
      // If this looks like a customer ID and we're in the customers section
      if (pathnames[0] === 'customers' && index === 1 && value.includes('-') && value.length > 30) {
        const customerName = customerNames[value];
        if (customerName) {
          name = customerName;
        } else {
          name = 'Customer'; // Fallback while loading
        }
      }
      
      // If this looks like an analytics page ID in the analytics/custom section
      if (pathnames[0] === 'analytics' && pathnames[1] === 'custom' && index === 2 && (value.includes('-') || value === 'customers')) {
        const pageName = analyticsPageNames[value];
        if (pageName) {
          name = pageName;
        } else {
          name = 'Analytics Page'; // Fallback while loading
        }
      }
      
      return { name, to, isLast };
    });
  };
  
  const breadcrumbs = generateBreadcrumbs();
  const isDashboard = breadcrumbs.length === 1 && breadcrumbs[0].name === 'Home';

  if (breadcrumbs.length === 0) {
    return null;
  }

  // On dashboard, just show "Home" without additional breadcrumbs
  if (isDashboard) {
    return (
      <div className="breadcrumbs">
        <span className="breadcrumb-item active">
          <Home className="breadcrumb-icon" />
          <span>Home</span>
        </span>
      </div>
    );
  }

  return (
    <div className="breadcrumbs">
      <Link to="/dashboard" className="breadcrumb-item">
        <Home className="breadcrumb-icon" />
        <span>Home</span>
      </Link>
      {breadcrumbs.map((breadcrumb, index) => (
        <React.Fragment key={breadcrumb.to}>
          <span className="breadcrumb-separator">/</span>
          {breadcrumb.isLast ? (
            <span className="breadcrumb-item active">{breadcrumb.name}</span>
          ) : (
            <Link to={breadcrumb.to} className="breadcrumb-item">
              {breadcrumb.name}
            </Link>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function MasterLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showNewPageModal, setShowNewPageModal] = useState(false);
  const [customPages, setCustomPages] = useState<AnalyticsPage[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [analyticsPageNames, setAnalyticsPageNames] = useState<Record<string, string>>({});
  const [autoCollapseTimer, setAutoCollapseTimer] = useState<NodeJS.Timeout | null>(null);
  const [sidebarInteracting, setSidebarInteracting] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const { isLoading: globalLoading, message: loaderMessage } = useLoader();

  // Get page-specific background class
  const getPageBackgroundClass = useCallback(() => {
    const path = location.pathname;
    
    if (path.startsWith('/products/')) return 'page-products';
    if (path.startsWith('/enquiries')) return 'page-enquiries';
    if (path.startsWith('/customers')) return 'page-customers';
    if (path.startsWith('/orders')) return 'page-orders';
    if (path.startsWith('/inventory')) return 'page-inventory';
    if (path.startsWith('/analytics')) return 'page-analytics';
    if (path.startsWith('/dashboard')) return 'page-dashboard';
    if (path.startsWith('/settings')) return 'page-settings';
    
    return 'page-default';
  }, [location.pathname]);

  // Fetch customer name by ID
  const fetchCustomerName = useCallback(async (customerId: string) => {
    if (customerNames[customerId]) {
      return customerNames[customerId];
    }

    try {
      const customer = await customerService.getById(customerId);
      const customerName = customer?.company_name || customer?.contact_name;
      if (customerName) {
        setCustomerNames(prev => ({
          ...prev,
          [customerId]: customerName
        }));
        return customerName;
      }
    } catch (err) {
      console.error('Error in fetchCustomerName:', err);
    }

    return null;
  }, [customerNames]);

  // Fetch analytics page name by ID
  const fetchAnalyticsPageName = useCallback(async (pageId: string) => {
    if (analyticsPageNames[pageId]) {
      return analyticsPageNames[pageId];
    }

    // Special handling for 'customers' page
    if (pageId === 'customers') {
      const pageName = 'Customer Analytics';
      setAnalyticsPageNames(prev => ({
        ...prev,
        [pageId]: pageName
      }));
      return pageName;
    }

    try {
      const page = await analyticsPageService.getPage(pageId);
      
      if (!page) {
        return null;
      }

      const pageName = page.name;
      if (pageName) {
        setAnalyticsPageNames(prev => ({
          ...prev,
          [pageId]: pageName
        }));
        return pageName;
      }
    } catch (err) {
      console.error('Error in fetchAnalyticsPageName:', err);
    }
    
    return null;
  }, [analyticsPageNames]);

  // Apply saved theme on component mount and listen for changes
  useEffect(() => {
    const applyTheme = () => {
      try {
        // Get saved theme from localStorage
        const savedTheme = localStorage.getItem('selectedTheme') || 'splitfin';

        let themeToApply = null;

        {
          // Use built-in theme
          const builtinThemes = [
            {
              id: 'splitfin',
              gradient: ['#34495d', '#2c3e50', '#1a1f2a'],
              colors: { primary: '#1a1f2a', accent: '#79d5e9', background: '#0f1419', surface: '#1a1f2a', text: '#ffffff' },
              type: 'dark'
            },
            {
              id: 'fire',
              gradient: ['#653232', '#602031', '#5a1f26'],
              colors: { primary: '#311d1d', accent: '#ff6b6b', background: '#2d1b1b', surface: '#311d1d', text: '#ffffff' },
              type: 'dark'
            },
            {
              id: 'forest',
              gradient: ['#345d55', '#2b4231', '#1b2a1a'],
              colors: { primary: '#1d3121', accent: '#4caf50', background: '#1b2a1a', surface: '#1d3121', text: '#ffffff' },
              type: 'dark'
            },
            {
              id: 'steel',
              gradient: ['#373838', '#323232', '#2d2d2d'],
              colors: { primary: '#373838', accent: '#90a4ae', background: '#1a1a1a', surface: '#373838', text: '#ffffff' },
              type: 'dark'
            },
            {
              id: 'light',
              gradient: ['#ebeeee', '#f5f5f5', '#fdfbfb'],
              colors: { primary: '#ebeeee', accent: '#1976d2', background: '#ffffff', surface: '#ebeeee', text: '#000000' },
              type: 'light'
            },
            {
              id: 'aqua',
              gradient: ['#d8fffe', '#eafffe', '#fefeff'],
              colors: { primary: '#d8fffe', accent: '#00bcd4', background: '#fefeff', surface: '#d8fffe', text: '#000000' },
              type: 'light'
            }
          ];
          
          themeToApply = builtinThemes.find(t => t.id === savedTheme) || builtinThemes[0];
        }
        
        if (themeToApply) {
          console.log('MasterLayout applying theme:', themeToApply);
          const root = document.documentElement;
          
          // Helper function to convert hex to RGB values
          const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
            } : {r: 26, g: 31, b: 42}; // fallback
          };
          
          // Convert theme colors to RGB
          const bgSecondaryRgb = hexToRgb(themeToApply.colors.surface);
          
          // Apply all CSS variables
          root.style.setProperty('--theme-name', themeToApply.id);
          root.style.setProperty('--theme-type', themeToApply.type);
          root.setAttribute('data-theme-type', themeToApply.type);
          root.style.setProperty('--color-primary', themeToApply.colors.primary);
          root.style.setProperty('--color-accent', themeToApply.colors.accent);
          root.style.setProperty('--bg-primary', themeToApply.colors.background);
          root.style.setProperty('--bg-secondary', themeToApply.colors.surface);
          root.style.setProperty('--bg-secondary-rgb', `${bgSecondaryRgb.r}, ${bgSecondaryRgb.g}, ${bgSecondaryRgb.b}`);
          root.style.setProperty('--text-primary', themeToApply.colors.text);
          
          // Apply light theme specific overrides
          if (themeToApply.type === 'light') {
            root.style.setProperty('--text-secondary', 'rgba(0, 0, 0, 0.7)');
            root.style.setProperty('--text-tertiary', 'rgba(0, 0, 0, 0.5)');
            root.style.setProperty('--text-muted', 'rgba(0, 0, 0, 0.4)');
            root.style.setProperty('--border-primary', 'rgba(0, 0, 0, 0.1)');
            root.style.setProperty('--bg-hover', 'rgba(0, 0, 0, 0.05)');
            root.style.setProperty('--bg-active', `rgba(${themeToApply.colors.accent.replace('#', '').match(/.{1,2}/g)?.map(hex => parseInt(hex, 16)).join(', ')}, 0.1)`);
            // Light theme sidebar text colors
            root.style.setProperty('--sidebar-text-inactive', 'rgba(0, 0, 0, 0.6)');
            root.style.setProperty('--sidebar-text-active', '#000000');
            root.style.setProperty('--sidebar-border-active', 'rgba(0, 0, 0, 0.2)');
          } else {
            // Reset to dark theme defaults
            root.style.setProperty('--text-secondary', 'rgba(255, 255, 255, 0.7)');
            root.style.setProperty('--text-tertiary', 'rgba(255, 255, 255, 0.5)');
            root.style.setProperty('--text-muted', 'rgba(255, 255, 255, 0.4)');
            root.style.setProperty('--border-primary', 'rgba(255, 255, 255, 0.1)');
            root.style.setProperty('--bg-hover', 'rgba(255, 255, 255, 0.05)');
            root.style.setProperty('--bg-active', 'rgba(121, 213, 233, 0.1)');
            // Dark theme sidebar text colors
            root.style.setProperty('--sidebar-text-inactive', 'rgba(255, 255, 255, 0.6)');
            root.style.setProperty('--sidebar-text-active', '#ffffff');
            root.style.setProperty('--sidebar-border-active', 'rgba(255, 255, 255, 0.2)');
          }
          
          root.style.setProperty('--sidebar-gradient', 
            `linear-gradient(135deg, ${themeToApply.gradient[0]}, ${themeToApply.gradient[1]}, ${themeToApply.gradient[2]})`);
            
          // Update logo based on theme type
          const logoPath = themeToApply.type === 'light' ? '/logos/splitfin.svg' : '/logos/splitfinrow.png';
          root.style.setProperty('--logo-url', logoPath);
          
          // Update logo images with requestAnimationFrame for better performance
          requestAnimationFrame(() => {
            const logoImages = document.querySelectorAll('.master-logo-image, .master-mobile-logo');
            logoImages.forEach((img) => {
              if (img instanceof HTMLImageElement) {
                img.src = logoPath;
              }
            });
          });
        }
      } catch (error) {
        console.error('Error applying theme:', error);
      }
    };
    
    // Apply theme on mount
    applyTheme();
    
    // Listen for storage changes (when theme is changed in another component)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selectedTheme') {
        console.log('Storage change detected, applying theme');
        applyTheme();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom theme change events
    const handleThemeChange = (e: any) => {
      console.log('Theme change event received:', e.detail);
      // Force re-apply theme when event is received
      requestAnimationFrame(() => {
        applyTheme();
      });
    };
    
    window.addEventListener('themeChanged', handleThemeChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('themeChanged', handleThemeChange);
    };
  }, []);

  // Load notifications for agent
  const loadNotifications = async () => {
    try {
      const result = await notificationService.list({ limit: 20 });
      setNotifications(result.data || []);
      setUnreadCount(result.unread_count || 0);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  // Check authentication and get agent data
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const agent = await authService.getCurrentAgent();
        if (!agent) {
          navigate('/login');
          return;
        }

        setUser(agent);

        // Load custom analytics pages
        await loadCustomPages();

        // Load notifications
        await loadNotifications();
      } catch (error) {
        console.error('Auth check failed:', error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  // Close mobile menu whenever the route changes
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  // Auto-open sections when on their respective pages
  useEffect(() => {
    if (location.pathname.startsWith('/settings') && !openSections.has('Settings')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Settings');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/dashboard') && !openSections.has('Dashboard')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Dashboard');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/analytics') && !openSections.has('Analytics')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Analytics');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/customers') && !openSections.has('Customers')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Customers');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/enquiries') && !openSections.has('Enquiries')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Enquiries');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/orders') && !openSections.has('Orders')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Orders');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/inventory') && !openSections.has('Inventory')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Inventory');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/shipping') && !openSections.has('Shipping')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Shipping');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/finance') && !openSections.has('Finance')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Finance');
        return newSet;
      });
    }
    if (location.pathname.startsWith('/suppliers') && !openSections.has('Suppliers')) {
      setOpenSections(prev => {
        const newSet = new Set(prev);
        newSet.add('Suppliers');
        return newSet;
      });
    }
  }, [location.pathname]);

  // Fetch customer names for breadcrumbs
  useEffect(() => {
    const pathSegments = location.pathname.split('/').filter((x) => x);
    
    // Check if we're on a customer detail page: /customers/{customerId}
    if (pathSegments[0] === 'customers' && pathSegments[1] && pathSegments[1] !== 'new' && pathSegments[1] !== 'map') {
      const customerId = pathSegments[1];
      // Check if it looks like a UUID (basic check)
      if (customerId.includes('-') && customerId.length > 30) {
        fetchCustomerName(customerId);
      }
    }
  }, [location.pathname, fetchCustomerName]);

  // Fetch analytics page names when navigating to custom analytics pages
  useEffect(() => {
    const pathSegments = location.pathname.split('/').filter((x) => x);
    
    // Check if we're on a custom analytics page: /analytics/custom/{pageId}
    if (pathSegments[0] === 'analytics' && pathSegments[1] === 'custom' && pathSegments[2]) {
      const pageId = pathSegments[2];
      // Fetch the page name for breadcrumbs
      fetchAnalyticsPageName(pageId);
    }
  }, [location.pathname, fetchAnalyticsPageName]);

  // Auto-collapse sidebar functionality
  const startAutoCollapseTimer = useCallback(() => {
    // Clear existing timer using state updater function to avoid dependency
    setAutoCollapseTimer(prevTimer => {
      if (prevTimer) {
        clearTimeout(prevTimer);
      }
      return null;
    });
    
    // Use longer delay on iPad/touch devices
    const isTablet = window.innerWidth <= 1024 && window.innerWidth > 768;
    const delay = isTablet ? 5000 : 3000; // 5 seconds on iPad, 3 seconds on desktop
    
    const timer = setTimeout(() => {
      // Use a state check instead of closure to get current value
      setSidebarInteracting(currentInteracting => {
        if (!currentInteracting) {
          setIsSidebarCollapsed(true);
        }
        return currentInteracting; // Don't change the state
      });
    }, delay);
    
    setAutoCollapseTimer(timer);
  }, []); // No dependencies needed since we use state updater functions
  
  const handleSidebarMouseEnter = useCallback(() => {
    setSidebarInteracting(true);
    setIsSidebarCollapsed(false);
    // Clear timer using state updater function to avoid dependency
    setAutoCollapseTimer(prevTimer => {
      if (prevTimer) {
        clearTimeout(prevTimer);
      }
      return null;
    });
  }, []);
  
  const handleSidebarMouseLeave = useCallback(() => {
    setSidebarInteracting(false);
    startAutoCollapseTimer();
  }, []);
  
  const handleSidebarClick = useCallback((e: React.MouseEvent) => {
    // If sidebar is collapsed and we're on iPad, expand it immediately
    if (isSidebarCollapsed) {
      e.stopPropagation();
      setSidebarInteracting(true);
      setIsSidebarCollapsed(false);
      // Clear timer using state updater function
      setAutoCollapseTimer(prevTimer => {
        if (prevTimer) {
          clearTimeout(prevTimer);
        }
        return null;
      });
      // Start timer to collapse again after interaction
      setTimeout(() => {
        setSidebarInteracting(false);
        startAutoCollapseTimer();
      }, 100);
    } else {
      setSidebarInteracting(true);
      setIsSidebarCollapsed(false);
      startAutoCollapseTimer();
    }
  }, [isSidebarCollapsed]);

  // Touch event handlers for iPad compatibility
  const handleSidebarTouchStart = useCallback((e: React.TouchEvent) => {
    // Always expand sidebar on touch
    setSidebarInteracting(true);
    setIsSidebarCollapsed(false);
    // Clear timer using state updater function
    setAutoCollapseTimer(prevTimer => {
      if (prevTimer) {
        clearTimeout(prevTimer);
      }
      return null;
    });
  }, []);

  const handleSidebarTouchEnd = useCallback((e: React.TouchEvent) => {
    // Don't immediately end interaction on touch end - let the auto-collapse timer handle it
    // This allows users to tap on navigation items after expanding the sidebar
    setTimeout(() => {
      setSidebarInteracting(false);
    }, 500); // Give time for navigation taps
  }, []);

  // Handler for navigation item interactions
  const handleNavItemInteraction = useCallback(() => {
    setSidebarInteracting(true);
    // Reset the auto-collapse timer when user interacts with nav items
    setAutoCollapseTimer(prevTimer => {
      if (prevTimer) {
        clearTimeout(prevTimer);
      }
      return null;
    });
    // Start fresh timer after nav interaction
    setTimeout(() => {
      setSidebarInteracting(false);
      startAutoCollapseTimer();
    }, 300);
  }, []);

  // Auto-collapse sidebar for AllProducts page and start timer for others
  useEffect(() => {
    if (location.pathname.includes('/products/')) {
      setIsSidebarCollapsed(true);
      if (autoCollapseTimer) {
        clearTimeout(autoCollapseTimer);
        setAutoCollapseTimer(null);
      }
    } else {
      startAutoCollapseTimer();
    }
  }, [location.pathname]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoCollapseTimer) {
        clearTimeout(autoCollapseTimer);
      }
    };
  }, [autoCollapseTimer]);


  const toggleSection = (section: string) => {
    setOpenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const loadCustomPages = async () => {
    try {
      const pages = await analyticsPageService.getUserPages();
      setCustomPages(pages);
    } catch (error) {
      console.error('Failed to load custom analytics pages:', error);
    }
  };

  const getSectionConfig = () => {
    const perms = user ? getAgentPermissions(user) : null;
    const config: Record<Section, { icon: React.ReactNode; links: NavLink[] }> = {
      Dashboard: {
        icon: <ChartLine />,
        links: []
      },
      Analytics: {
        icon: <ChartLine />,
        links: perms?.analytics ? [
          { to: '/analytics/overview', label: 'Overview', icon: <Home /> },
          ...customPages.map(page => ({
            to: `/analytics/custom/${page.id}`,
            label: page.name,
            icon: iconMapping[page.icon] || <ChartLine />
          }))
        ] : []
      },
      Customers: {
        icon: <UsersGroup />,
        links: perms?.customers ? [
          { to: '/customers', label: 'View Customers', icon: <UsersGroup /> },
          { to: '/customers/map', label: 'Customer Map', icon: <Map /> }
        ] : []
      },
      Enquiries: {
        icon: <Mail />,
        links: perms?.customers ? [
          { to: '/enquiries', label: 'View Enquiries', icon: <Mail /> }
        ] : []
      },
      Orders: {
        icon: <Clipboard />,
        links: []
      },
      Inventory: {
        icon: <Package />,
        links: perms?.inventory ? [
          { to: '/inventory/overview', label: 'Overview', icon: <ChartLine /> },
          { to: '/inventory/products', label: 'Inventory Management', icon: <Box /> },
          { to: '/inventory/product-list', label: 'Product List', icon: <Package /> },
          { to: '/inventory/stocklists', label: 'Stocklists', icon: <File /> }
        ] : []
      },
      Shipping: {
        icon: <Truck />,
        links: perms?.inventory ? [
          { to: '/shipping/warehouse', label: 'Warehouse', icon: <Store /> },
          { to: '/shipping/couriers', label: 'Couriers', icon: <Truck /> },
          { to: '/shipping/deliveries', label: 'Deliveries', icon: <Package /> }
        ] : []
      },
      Finance: {
        icon: <Cart />,
        links: perms?.finance ? [
          { to: '/finance/invoices', label: 'Invoices', icon: <File /> },
          { to: '/finance/purchase-orders', label: 'Purchase Orders', icon: <Cart /> },
          { to: '/finance/debt', label: 'Debt Management', icon: <File /> }
        ] : []
      },
      Suppliers: {
        icon: <User />,
        links: perms?.suppliers ? [
          { to: '/suppliers', label: 'Supplier Management', icon: <User /> },
          { to: '/suppliers/new', label: 'Add New Supplier', icon: <Plus /> },
          { to: '/catalogues', label: 'Catalogues', icon: <FaCatalogue /> }
        ] : []
      },
      'Image Management': {
        icon: <Image />,
        links: perms?.imageManagement ? [
          { to: '/image-management', label: 'Image Management', icon: <Image /> }
        ] : []
      },
      Messaging: {
        icon: <Mail />,
        links: [
          { to: '/messaging', label: 'Team Messages', icon: <Mail /> }
        ]
      },
      Settings: {
        icon: <Cog />,
        links: [
          { to: '/settings', label: 'General Settings', icon: <Cog /> },
          { to: '/settings/profile', label: 'Profile', icon: <User /> },
          { to: '/settings/help', label: 'Help', icon: <QuestionCircle /> }
        ]
      }
    };
    return config;
  };

  const getAvailableSections = (): Section[] => {
    if (!user) return ['Dashboard'];
    const perms = getAgentPermissions(user);

    const sections: Section[] = ['Dashboard'];

    // Admins see everything
    if (perms.isAdmin) {
      sections.push('Customers', 'Enquiries', 'Orders', 'Inventory', 'Shipping', 'Finance', 'Suppliers', 'Image Management', 'Messaging');
    } else {
      // Regular agents see core sales sections
      if (perms.customers) {
        sections.push('Customers');
        sections.push('Enquiries');
      }
      if (perms.orders) sections.push('Orders');
      sections.push('Messaging');
    }

    sections.push('Settings');

    return sections;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const availableSections = getAvailableSections();
  const sectionConfig = getSectionConfig();
  
  // Route map for determining active section
  const sectionRouteMap: Record<string, string> = {
    'Dashboard': '/dashboard',
    'Analytics': '/analytics',
    'Customers': '/customers',
    'Enquiries': '/enquiries',
    'Orders': '/orders',
    'Inventory': '/inventory',
    'Shipping': '/shipping',
    'Finance': '/finance',
    'Suppliers': '/suppliers',
    'Image Management': '/image-management',
    'Messaging': '/messaging',
    'Settings': '/settings',
  };

  const renderNavLinks = () => (
    availableSections.map(section => {
      const config = sectionConfig[section];
      const isOpen = openSections.has(section);
      const hasSubItems = config.links.length > 0;
      const isDirectNav = section === 'Dashboard' || section === 'Orders';

      const sectionRoute = sectionRouteMap[section] || '';
      const isActive = sectionRoute && location.pathname.startsWith(sectionRoute);

      return (
        <div key={section} className="master-sidebar-nav-section">
          <button
            className={`master-sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => {
              if (isDirectNav) {
                navigate(sectionRouteMap[section]);
              } else {
                toggleSection(section);
              }
            }}
            onTouchStart={handleNavItemInteraction}
          >
            <span className="master-sidebar-nav-icon">{config.icon}</span>
            {!isSidebarCollapsed && (
              <>
                <span className="master-sidebar-nav-text">{section}</span>
                {hasSubItems && <span className="master-sidebar-nav-chevron">{isOpen ? <ChevronDown /> : <ChevronRight />}</span>}
              </>
            )}
          </button>
          {hasSubItems && !isSidebarCollapsed && (
            <div className={`master-sidebar-dropdown ${isOpen ? 'open' : ''}`}>
              {config.links.map(link => (
                <div key={link.to} className="master-sidebar-nav-link-wrapper">
                  <Link
                    to={link.to}
                    className={`master-sidebar-dropdown-item ${location.pathname === link.to ? 'active' : ''}`}
                    onTouchStart={handleNavItemInteraction}
                  >
                    {link.icon && <span className="master-sidebar-dropdown-icon">{link.icon}</span>}
                    <span className="master-sidebar-dropdown-text">{link.label}</span>
                  </Link>
                  {section === 'Analytics' && link.to.includes('/analytics/custom/') && (
                    <button
                      className="master-sidebar-delete-page-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        const pageId = link.to.split('/analytics/custom/')[1];
                        handleDeletePage(pageId, link.label);
                      }}
                      title={`Delete ${link.label}`}
                    >
                      <X />
                    </button>
                  )}
                </div>
              ))}
              {section === 'Analytics' && (
                <button
                  className="master-sidebar-dropdown-item master-sidebar-new-page-btn"
                  onClick={() => setShowNewPageModal(true)}
                >
                  <span className="master-sidebar-dropdown-icon"><Plus /></span>
                  <span className="master-sidebar-dropdown-text">New Page</span>
                </button>
              )}
            </div>
          )}
        </div>
      );
    })
  );

  const handleCreateNewPage = async (pageName: string, icon: string, template: string) => {
    try {
      const newPage = await analyticsPageService.createPage({
        name: pageName,
        icon: icon,
        template: template
      });
      
      // Refresh the custom pages list
      await loadCustomPages();
      
      // Navigate to the new page
      navigate(`/analytics/custom/${newPage.id}`);
      
      console.log('Successfully created new analytics page:', newPage);
    } catch (error) {
      console.error('Failed to create new analytics page:', error);
      // You could add a toast notification here to inform the user of the error
    }
  };

  const handleDeletePage = async (pageId: string, pageName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${pageName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await analyticsPageService.deletePage(pageId);
      
      // Refresh the custom pages list
      await loadCustomPages();
      
      // If we're currently on the deleted page, navigate to overview
      if (location.pathname === `/analytics/custom/${pageId}`) {
        navigate('/analytics/overview');
      }
      
      console.log('Successfully deleted analytics page:', pageName);
    } catch (error) {
      console.error('Failed to delete analytics page:', error);
      alert('Failed to delete the page. Please try again.');
    }
  };

  return (
    <div className={`master-layout-container ${getPageBackgroundClass()}`}>
      {/* Desktop Sidebar */}
      <nav
        className={`master-sidebar-nav desktop-only ${isSidebarCollapsed ? 'collapsed' : ''}`}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        onClick={handleSidebarClick}
        onTouchStart={handleSidebarTouchStart}
        onTouchEnd={handleSidebarTouchEnd}
      >
        {/* User Section */}
        <div className="master-sidebar-user-section">
          <div className="master-user-avatar">
            <span>{(user.name || user.id).charAt(0).toUpperCase()}</span>
          </div>
          {!isSidebarCollapsed && (
            <div className="master-user-info">
              <h4>{user.name || user.id}</h4>
              <p>{user.is_admin ? 'Admin' : 'Sales Agent'}</p>
            </div>
          )}
        </div>

        {/* Navigation Sections */}
        <div className="master-sidebar-nav-sections">
          {renderNavLinks()}
        </div>

        {/* Logout Button - Bottom */}
        <div className="master-sidebar-logout-section">
          <button
            className="master-sidebar-logout-btn"
            onClick={handleLogout}
          >
            <Logout />
            {!isSidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </nav>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="notifications-overlay" onClick={() => setShowNotifications(false)}>
          <div className="notifications-panel" onClick={(e) => e.stopPropagation()}>
            <div className="notifications-header">
              <h3>Notifications</h3>
              <button onClick={() => setShowNotifications(false)}>×</button>
            </div>
            <div className="notifications-list">
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <div 
                    key={notification.id} 
                    className={`notification-item ${!notification.read ? 'unread' : ''}`}
                  >
                    <div className="notification-content">
                      <h4>{notification.title}</h4>
                      <p>{notification.message}</p>
                      <span className="notification-time">
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-notifications">
                  <p>No notifications</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="master-main-content">
        {/* Desktop Header Bar with Breadcrumbs */}
        <div className="master-header-bar desktop-only">
          <div className="master-header-left">
            <Breadcrumbs customerNames={customerNames} analyticsPageNames={analyticsPageNames} />
          </div>
          <div className="master-header-right">
            <button
              className="master-header-action-btn notifications-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
            >
              <Bell />
              {unreadCount > 0 && (
                <span className="notification-badge">{unreadCount}</span>
              )}
            </button>
            <button
              className="master-header-action-btn"
              onClick={() => navigate('/messaging')}
              aria-label="Team Messages"
            >
              <Mail />
            </button>
            <button
              className="master-header-action-btn"
              onClick={() => navigate('/settings')}
              aria-label="Settings"
            >
              <Cog />
            </button>
          </div>
        </div>

        {/* Mobile Top Bar */}
        <header className="master-mobile-top-bar mobile-only">
          <div className="master-sidebar-logo">
            <img src="/logos/splitfinrow.png" alt="Splitfin Logo" className="master-mobile-logo" />
          </div>
          <div className="master-mobile-controls">
            <button 
              type="button"
              className="master-mobile-menu-toggle" 
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            >
              {isMobileNavOpen ? <X /> : <Menu />}
            </button>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
        {isMobileNavOpen && (
          <div 
            className="master-mobile-overlay mobile-only"
            onClick={() => setIsMobileNavOpen(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <nav className={`master-mobile-nav mobile-only ${isMobileNavOpen ? 'open' : ''}`}>
          <div className="master-mobile-nav-header">
            <button
              onClick={() => setIsMobileNavOpen(false)}
              className="master-mobile-close"
            >
              <X />
            </button>
          </div>
          <div className="master-mobile-user-section">
            <div className="master-user-avatar">
              <span>{(user.name || user.id).charAt(0).toUpperCase()}</span>
            </div>
            <div className="master-user-info">
              <h4>{user.name || user.id}</h4>
              <p>{user.is_admin ? 'Admin' : 'Sales Agent'}</p>
            </div>
          </div>
          <div className="master-sidebar-nav-sections">
            {renderNavLinks()}
          </div>
          <div className="master-mobile-nav-footer">
            <button onClick={handleLogout} className="master-mobile-logout-btn">
              <Logout />
              <span>Logout</span>
            </button>
          </div>
        </nav>

        {/* Content Area */}
        <div className="master-content-area">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/analytics/*" element={<Analytics />} />
            <Route path="/customers" element={<CustomersManagement />} />
            <Route path="/customers/map" element={<CustomerMap />} />
            <Route path="/customers/:customerId" element={<CustomerDetail />} />
            
            {/* Enquiry Management Routes */}
            <Route path="/enquiries" element={<EnquiryList />} />
<Route path="/enquiries/:enquiryId" element={<ViewEnquiry />} />
            
            {/* Order Management Routes */}
            <Route path="/orders" element={<ViewOrders />} />
            <Route path="/orders/new" element={<NewOrder />} />
            <Route path="/orders/management" element={<OrderManagement />} />
            <Route path="/order/:orderId" element={<ViewOrder />} />
            <Route path="/select-brand/:customerId" element={<BrandSelector />} />
            <Route path="/products/:customerId/:brand" element={<NewAllProducts />} />
            <Route path="/order-summary" element={<OrderSummary />} />
            <Route path="/order-confirmation" element={<OrderConfirmation />} />
            <Route path="/order-detail/:orderId" element={<OrderDetail />} />
            
            {/* Inventory Management Routes */}
            <Route path="/inventory/overview" element={<InventoryOverview />} />
            <Route path="/inventory/products" element={<InventoryProducts />} />
            <Route path="/inventory/product-list" element={<ProductList />} />
            <Route path="/inventory/stock" element={<div style={{color: 'var(--text-primary)', padding: '2rem'}}>Stock Manager - Coming Soon</div>} />
            
            {/* Shipping Routes */}
            <Route path="/shipping/warehouse" element={<Warehouse />} />
            <Route path="/shipping/couriers" element={<Couriers />} />
            <Route path="/shipping/deliveries" element={<Deliveries />} />
            <Route path="/inventory/stocklists" element={<div style={{color: 'var(--text-primary)', padding: '2rem'}}>Stocklists - Coming Soon</div>} />
            <Route path="/inventory/barcode-scanner" element={<BarcodeScannerApp />} />
            <Route path="/inventory/airtable" element={<AirtableDemo />} />
            
            {/* Catalogues and Image Management Routes */}
            <Route path="/catalogues" element={<CataloguesLanding />} />
            <Route path="/image-management" element={<ImageManagement />} />
            
            {/* Messaging Routes */}
            <Route path="/messaging" element={<Messaging />} />
            
            {/* Settings Routes */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/*" element={<Settings />} />
            
            <Route index element={<Dashboard />} />
            <Route path="*" element={<div style={{color: 'var(--text-primary)', padding: '2rem'}}>Page not found</div>} />
          </Routes>
        </div>
      </div>

      {/* New Page Modal */}
      <NewPageModal
        isVisible={showNewPageModal}
        onClose={() => setShowNewPageModal(false)}
        onSave={handleCreateNewPage}
      />
      
      {/* Offline Status Indicator */}
      <OfflineStatus />

      {/* Global Progress Loader */}
      <ProgressLoader
        isVisible={globalLoading}
        message={loaderMessage}
      />
    </div>
  );
}