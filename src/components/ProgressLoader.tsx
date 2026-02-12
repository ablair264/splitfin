import React, { useEffect, useMemo, useState } from 'react';
import Lottie from 'lottie-react';
import { useLocation } from 'react-router-dom';
import loaderAnimation from '../splitload.json';
import './ProgressLoader.css';

interface ProgressLoaderProps {
  progress?: number;
  message?: string;
  isVisible: boolean;
  fullscreen?: boolean;
}

// Dynamic messages based on route
const routeMessages: { [key: string]: string } = {
  '/dashboard': 'Loading Dashboard...',
  '/orders': 'Fetching Orders...',
  '/orders/new': 'Preparing New Order...',
  '/customers': 'Fetching Customer Data...',
  '/analytics': 'Loading Analytics...',
  '/analytics/overview': 'Preparing Analytics Overview...',
  '/analytics/custom': 'Loading Custom Dashboard...',
  '/products': 'Loading Products...',
  '/brands': 'Fetching Brand Information...',
  '/settings': 'Loading Settings...',
  '/profile': 'Loading Profile...',
};

export const ProgressLoader: React.FC<ProgressLoaderProps> = ({ 
  progress,
  message,
  isVisible,
  fullscreen = true
}) => {
  const location = useLocation();
  const [displayProgress, setDisplayProgress] = useState(0);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [lightAnimation, setLightAnimation] = useState<any | null>(null);
  const [darkAnimation, setDarkAnimation] = useState<any | null>(null);
  
  
  // Get dynamic message based on current route
  const getRouteMessage = () => {
    if (message) return message;
    
    // Try exact match first
    if (routeMessages[location.pathname]) {
      return routeMessages[location.pathname];
    }
    
    // Try to match parent routes
    const pathSegments = location.pathname.split('/').filter(Boolean);
    for (let i = pathSegments.length; i > 0; i--) {
      const partialPath = '/' + pathSegments.slice(0, i).join('/');
      if (routeMessages[partialPath]) {
        return routeMessages[partialPath];
      }
    }
    
    return 'Loading...';
  };

  // Smooth progress animation
  useEffect(() => {
    if (progress !== undefined) {
      const timer = setTimeout(() => {
        setDisplayProgress(progress);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  // Auto-increment progress if no progress provided
  useEffect(() => {
    if (isVisible && progress === undefined) {
      const interval = setInterval(() => {
        setDisplayProgress(prev => {
          if (prev >= 90) return 90; // Cap at 90% until actually complete
          return prev + Math.random() * 10;
        });
      }, 500);
      
      return () => clearInterval(interval);
    }
  }, [isVisible, progress]);

  // Reset progress when hiding
  useEffect(() => {
    if (!isVisible) {
      const timer = setTimeout(() => {
        setDisplayProgress(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setIsDark(root.classList.contains('dark'));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isActive = true;
    const loadAnimations = async () => {
      try {
        const [lightResponse, darkResponse] = await Promise.all([
          fetch('/light.json'),
          fetch('/dark.json'),
        ]);
        if (!isActive) return;
        if (lightResponse.ok) setLightAnimation(await lightResponse.json());
        if (darkResponse.ok) setDarkAnimation(await darkResponse.json());
      } catch {
        // Fallback to bundled animation
      }
    };
    loadAnimations();
    return () => {
      isActive = false;
    };
  }, []);

  const animationData = useMemo(
    () => (isDark ? darkAnimation : lightAnimation) ?? loaderAnimation,
    [isDark, darkAnimation, lightAnimation]
  );

  if (!isVisible) return null;

  return (
    <div className={`progress-loader-overlay ${fullscreen ? 'fullscreen' : ''}`}>
      <div className="progress-loader-backdrop" />
      <div className="progress-loader-container">
        <div className="progress-loader-content">
          <div className="progress-loader-animation">
            <Lottie 
              animationData={animationData}
              loop={true}
              autoplay={true}
              style={{ width: 120, height: 120 }}
            />
          </div>
          <div className="progress-info">
            <h3 className="progress-message">{getRouteMessage()}</h3>
          </div>
          <div className="progress-loader-bar-container">
            <div className="progress-loader-bar">
              <div 
                className="progress-bar-fill"
                style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }}
              />
            </div>
            <span className="progress-percentage">{Math.round(displayProgress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressLoader;
