import React from 'react';
import { WifiOff } from 'lucide-react';

const OfflineStatus: React.FC = () => {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-5 left-5 bg-destructive text-destructive-foreground px-5 py-3 rounded-lg flex items-center gap-2 z-[9999] shadow-md">
      <WifiOff size={18} />
      You are offline
    </div>
  );
};

export default OfflineStatus;
