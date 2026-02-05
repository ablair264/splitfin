import React, { ComponentType, useState, useCallback } from 'react';
import { useLoader } from '../contexts/LoaderContext';

interface WithLoaderProps {
  isLoading?: boolean;
}

interface ComponentLoaderReturn {
  showLoader: (message?: string) => void;
  hideLoader: () => void;
  setProgress: (progress: number) => void;
  isLoading: boolean;
  progress: number;
}

export function useComponentLoader(): ComponentLoaderReturn {
  const { showLoader: globalShow, hideLoader: globalHide, isLoading } = useLoader();
  const [progress, setProgressState] = useState(0);

  const showLoader = useCallback((message?: string) => {
    setProgressState(0);
    globalShow(message);
  }, [globalShow]);

  const hideLoader = useCallback(() => {
    setProgressState(100);
    globalHide();
  }, [globalHide]);

  const setProgress = useCallback((value: number) => {
    setProgressState(Math.min(100, Math.max(0, value)));
  }, []);

  return {
    showLoader,
    hideLoader,
    setProgress,
    isLoading,
    progress,
  };
}

export function withLoader<P extends object>(
  WrappedComponent: ComponentType<P>,
  loadingMessage?: string
) {
  const WithLoaderComponent = (props: P & WithLoaderProps) => {
    const { showLoader, hideLoader } = useLoader();

    // Expose loader functions via props if needed
    const enhancedProps = {
      ...props,
      showLoader: (msg?: string) => showLoader(msg || loadingMessage),
      hideLoader,
    };

    return <WrappedComponent {...enhancedProps as P} />;
  };

  WithLoaderComponent.displayName = `withLoader(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithLoaderComponent;
}

export default withLoader;
