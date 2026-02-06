import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';

interface CompactAISummaryProps {
  companyId: string;
}

interface SummaryData {
  content: string;
  timestamp: Date;
  refreshCount: number;
}

const CompactAISummary: React.FC<CompactAISummaryProps> = ({ companyId }) => {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxRefreshes = 5;
  const refreshInterval = 5 * 60 * 1000; // 5 minutes

  const generateSummary = async () => {
    if (refreshCount >= maxRefreshes) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<{
        summary: string;
        generatedAt: string;
      }>('/analytics/ai-summary', { detailed: false });

      setSummary({
        content: response.data.summary,
        timestamp: new Date(response.data.generatedAt),
        refreshCount: refreshCount + 1
      });
      setRefreshCount(prev => prev + 1);
    } catch (err) {
      console.error('Error generating summary:', err);
      setError('Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  // Initialize and set up auto-refresh
  useEffect(() => {
    generateSummary();

    intervalRef.current = setInterval(() => {
      if (refreshCount < maxRefreshes && isVisible) {
        generateSummary();
      }
    }, refreshInterval);

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

  // Pause auto-refresh when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 p-0 transition-all duration-200 max-w-full min-h-0 relative bg-transparent border-none rounded-none">
      <div className="flex-1 min-w-0 flex items-center">
        {loading && !summary && (
          <span className="text-muted-foreground text-[13px] leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis max-w-full">Loading...</span>
        )}

        {error && (
          <span className="text-muted-foreground text-[13px] leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis max-w-full">&mdash;</span>
        )}

        {summary && !loading && !error && (
          <span className="text-muted-foreground text-[13px] leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{summary.content}</span>
        )}

        {!summary && !loading && !error && (
          <span className="text-muted-foreground text-[13px] leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis max-w-full">&mdash;</span>
        )}
      </div>
    </div>
  );
};

export default CompactAISummary;
