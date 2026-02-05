import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import './CompactAISummary.css';

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
    <div className="compact-ai-summary">
      <div className="ai-content">
        {loading && !summary && (
          <span className="ai-text ai-loading-text">Loading...</span>
        )}

        {error && (
          <span className="ai-text ai-error-text">—</span>
        )}

        {summary && !loading && !error && (
          <span className="ai-text">{summary.content}</span>
        )}

        {!summary && !loading && !error && (
          <span className="ai-text">—</span>
        )}
      </div>
    </div>
  );
};

export default CompactAISummary;
