import React, { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
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

  const content = loading && !summary
    ? 'Generating summary...'
    : error
      ? null
      : summary?.content ?? null;

  if (!content) return null;

  return (
    <div className="flex items-center gap-2.5 mt-2">
      <div className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/10 shrink-0">
        <Sparkles size={11} className={`text-primary ${loading && !summary ? 'animate-pulse' : ''}`} />
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground truncate">
        {content}
      </p>
    </div>
  );
};

export default CompactAISummary;
