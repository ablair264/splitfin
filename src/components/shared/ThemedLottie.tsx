import { useEffect, useMemo, useState } from "react";
import Lottie from "lottie-react";

let lightCache: any | null = null;
let darkCache: any | null = null;
let loadPromise: Promise<void> | null = null;

const loadAnimations = async () => {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [lightResponse, darkResponse] = await Promise.all([
        fetch("/light.json"),
        fetch("/dark.json"),
      ]);
      if (lightResponse.ok) lightCache = await lightResponse.json();
      if (darkResponse.ok) darkCache = await darkResponse.json();
    } catch {
      // ignore
    }
  })();
  return loadPromise;
};

const useIsDark = () => {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setIsDark(root.classList.contains("dark"));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};

interface ThemedLottieProps {
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  autoplay?: boolean;
  fallbackData?: any;
}

export function ThemedLottie({
  className,
  style,
  loop = true,
  autoplay = true,
  fallbackData,
}: ThemedLottieProps) {
  const isDark = useIsDark();
  const [isLoaded, setIsLoaded] = useState(() => !!(lightCache || darkCache));

  useEffect(() => {
    let isActive = true;
    loadAnimations().then(() => {
      if (isActive) setIsLoaded(true);
    });
    return () => {
      isActive = false;
    };
  }, []);

  const animationData = useMemo(() => {
    const themed = isDark ? darkCache : lightCache;
    return themed ?? fallbackData ?? null;
  }, [isDark, isLoaded, fallbackData]);

  if (!animationData) return null;

  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoplay={autoplay}
      className={className}
      style={style}
    />
  );
}

export default ThemedLottie;
