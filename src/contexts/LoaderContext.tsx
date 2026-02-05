import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface LoaderContextValue {
  isLoading: boolean;
  message: string;
  showLoader: (message?: string) => void;
  hideLoader: () => void;
}

const LoaderContext = createContext<LoaderContextValue | undefined>(undefined);

interface LoaderProviderProps {
  children: ReactNode;
}

export function LoaderProvider({ children }: LoaderProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('Loading...');

  const showLoader = useCallback((msg?: string) => {
    setMessage(msg || 'Loading...');
    setIsLoading(true);
  }, []);

  const hideLoader = useCallback(() => {
    setIsLoading(false);
    setMessage('Loading...');
  }, []);

  return (
    <LoaderContext.Provider value={{ isLoading, message, showLoader, hideLoader }}>
      {children}
    </LoaderContext.Provider>
  );
}

export function useLoader(): LoaderContextValue {
  const context = useContext(LoaderContext);
  if (!context) {
    // Return a no-op implementation if used outside provider
    return {
      isLoading: false,
      message: '',
      showLoader: () => {},
      hideLoader: () => {},
    };
  }
  return context;
}

export default LoaderContext;
