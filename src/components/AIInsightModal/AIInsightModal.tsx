import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, TrendingUp, TrendingDown, Minus, AlertCircle, BarChart3, Lightbulb, Target, Zap } from 'lucide-react';

export interface AIInsight {
  insight: string;
  trend: 'increasing' | 'decreasing' | 'stable' | 'unavailable';
  action: string;
  priority: 'low' | 'medium' | 'high';
  impact: string;
  itemTrends?: {
    topItem: string;
    emergingTrends: string[];
    decliningItems: string[];
  };
  valueAnalysis?: {
    currentAOV: number;
    historicalComparison: string;
    recommendations: string[];
  };
  volumeTrends?: {
    comparison: string;
    seasonalPattern: string;
    monthlyTrend: string;
  };
  revenueBreakdown?: string;
  customerAnalysis?: string;
  growthDrivers?: string;
  recommendations?: string[];
  forecast?: string;
}

interface AIInsightModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardTitle: string;
  insight: AIInsight | null;
  isLoading: boolean;
}

const trendIconClasses: Record<string, string> = {
  increasing: 'w-4 h-4 text-emerald-500',
  decreasing: 'w-4 h-4 text-red-500',
  stable: 'w-4 h-4 text-amber-500',
  unavailable: 'w-4 h-4 text-gray-500',
};

const trendTextClasses: Record<string, string> = {
  increasing: 'text-xs font-medium capitalize text-emerald-500',
  decreasing: 'text-xs font-medium capitalize text-red-500',
  stable: 'text-xs font-medium capitalize text-amber-500',
  unavailable: 'text-xs font-medium capitalize text-gray-500',
};

const AIInsightModal: React.FC<AIInsightModalProps> = ({
  isOpen,
  onClose,
  cardTitle,
  insight,
  isLoading
}) => {
  const [animationClass, setAnimationClass] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAnimationClass('opacity-0 scale-95');
      setTimeout(() => setAnimationClass('opacity-100 scale-100 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'), 10);
    } else {
      setAnimationClass('opacity-0 scale-95 transition-all duration-200 ease-out');
    }
  }, [isOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getTrendIcon = () => {
    if (!insight) return <Minus className="w-4 h-4" />;

    switch (insight.trend) {
      case 'increasing':
        return <TrendingUp className={trendIconClasses.increasing} />;
      case 'decreasing':
        return <TrendingDown className={trendIconClasses.decreasing} />;
      case 'stable':
        return <Minus className={trendIconClasses.stable} />;
      default:
        return <AlertCircle className={trendIconClasses.unavailable} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-5 isolate"
      onClick={onClose}
    >
      <div
        className={`bg-slate-800 rounded-2xl w-full max-w-[480px] max-h-[90vh] overflow-hidden shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3)] flex flex-col relative m-auto sm:mx-2.5 ${animationClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 sm:p-5 border-b border-slate-700">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-100 m-0">{cardTitle} - AI Analysis</h2>
            {insight && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-700 rounded-full">
                {getTrendIcon()}
                <span className={trendTextClasses[insight.trend]}>
                  {insight.trend}
                </span>
              </div>
            )}
          </div>
          <button
            className="bg-transparent border-none text-slate-400 cursor-pointer p-2 rounded-lg transition-all duration-200 flex items-center justify-center hover:bg-slate-700 hover:text-slate-100"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-5">
              <div className="flex gap-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.32s]" />
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.16s]" />
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" />
              </div>
              <p className="text-slate-400 text-sm">Analyzing your data...</p>
            </div>
          ) : insight ? (
            <>
              {/* Key Insight Section */}
              <div className="mb-6 last-of-type:mb-0">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={18} className="text-blue-400" />
                  <h3 className="text-base font-semibold text-slate-100 m-0">Key Insight</h3>
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                  <p className="text-slate-300 leading-relaxed m-0">{insight.insight}</p>
                </div>
              </div>

              {/* Trend Analysis Section */}
              {insight.trend !== 'unavailable' && (
                <div className="mb-6 last-of-type:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={18} className="text-blue-400" />
                    <h3 className="text-base font-semibold text-slate-100 m-0">Trend Analysis</h3>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                    {insight.volumeTrends ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Comparison:</span>
                          <span className="text-slate-100 text-sm font-medium">{insight.volumeTrends.comparison}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Seasonal Pattern:</span>
                          <span className="text-slate-100 text-sm font-medium">{insight.volumeTrends.seasonalPattern}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Monthly Trend:</span>
                          <span className="text-slate-100 text-sm font-medium">{insight.volumeTrends.monthlyTrend}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-300 leading-relaxed m-0">{insight.trend}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Recommendations Section */}
              <div className="mb-6 last-of-type:mb-0">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={18} className="text-blue-400" />
                  <h3 className="text-base font-semibold text-slate-100 m-0">Recommended Action</h3>
                </div>
                <div className="bg-[#1e3a5f] border border-blue-500 rounded-xl p-4">
                  <p className="text-blue-100 leading-relaxed m-0">{insight.action}</p>
                  {insight.recommendations && insight.recommendations.length > 0 && (
                    <ul className="mt-3 pl-5 mb-0">
                      {insight.recommendations.map((rec, index) => (
                        <li key={index} className="text-blue-300 mb-2 last:mb-0">{rec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Additional Analysis */}
              {(insight.itemTrends || insight.valueAnalysis || insight.forecast) && (
                <div className="mb-6 last-of-type:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={18} className="text-blue-400" />
                    <h3 className="text-base font-semibold text-slate-100 m-0">Deep Analysis</h3>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                    {insight.itemTrends && (
                      <div className="mb-4 last:mb-0">
                        <h4 className="text-blue-400 text-sm font-semibold mb-2 mt-0">Item Performance</h4>
                        <p className="text-slate-300 leading-relaxed mb-1.5"><strong className="text-slate-100">Top Item:</strong> {insight.itemTrends.topItem}</p>
                        {insight.itemTrends.emergingTrends.length > 0 && (
                          <p className="text-slate-300 leading-relaxed mb-1.5"><strong className="text-slate-100">Emerging:</strong> {insight.itemTrends.emergingTrends.join(', ')}</p>
                        )}
                      </div>
                    )}
                    {insight.forecast && (
                      <div className="mb-4 last:mb-0">
                        <h4 className="text-blue-400 text-sm font-semibold mb-2 mt-0">Forecast</h4>
                        <p className="text-slate-300 leading-relaxed m-0">{insight.forecast}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer Metadata */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-slate-700">
                <div
                  className="px-4 py-1.5 rounded-full text-sm font-medium capitalize"
                  style={{ backgroundColor: getPriorityColor(insight.priority) + '20',
                           color: getPriorityColor(insight.priority) }}
                >
                  Priority: {insight.priority}
                </div>
                <div className="px-4 py-1.5 rounded-full text-sm font-medium bg-slate-700 text-slate-300">
                  Impact: {insight.impact}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-4">
              <AlertCircle size={48} className="text-red-500" />
              <h3 className="text-slate-100 text-lg m-0">Unable to generate insights at this time</h3>
              <p className="text-slate-400 text-sm m-0">Please try again in a few moments</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render modal using Portal to ensure it's at document root
  return ReactDOM.createPortal(
    modalContent,
    document.body
  );
};

export default AIInsightModal;
