import React from 'react';
import AIInsightButton from '../AIInsightButton/AIInsightButton';
import AIInsightModal from '../AIInsightModal/AIInsightModal';
import { useAIInsight } from '../../hooks/useAIInsight';

interface DataPoint {
  name: string;
  value: number;
  change?: number;
  previousValue?: number;
  date?: string;
}

interface AIInsightWrapperProps {
  children: React.ReactNode;
  cardTitle: string;
  currentData: DataPoint[];
  historicalData?: DataPoint[];
  dataType: 'revenue' | 'orders' | 'customers' | 'products' | 'performance' | 'general';
  timeFrame?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  buttonPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  buttonSize?: 'small' | 'medium' | 'large';
  buttonVariant?: 'primary' | 'secondary' | 'ghost';
}

const positionClasses = {
  'top-right': 'top-2 right-2',
  'top-left': 'top-2 left-2',
  'bottom-right': 'bottom-2 right-2',
  'bottom-left': 'bottom-2 left-2',
} as const;

const AIInsightWrapper: React.FC<AIInsightWrapperProps> = ({
  children,
  cardTitle,
  currentData,
  historicalData,
  dataType,
  timeFrame = 'monthly',
  buttonPosition = 'top-right',
  buttonSize = 'small',
  buttonVariant = 'ghost'
}) => {
  const {
    insight,
    isLoading,
    isModalOpen,
    error,
    generateInsight,
    closeModal
  } = useAIInsight({ cardTitle, dataType, timeFrame });

  const handleInsightClick = () => {
    generateInsight(currentData, historicalData);
  };

  return (
    <div className="relative w-full h-full group">
      <div className="w-full h-full">
        {children}
      </div>

      <div className={`absolute z-10 opacity-70 transition-opacity duration-200 group-hover:opacity-100 ${positionClasses[buttonPosition]}`}>
        <AIInsightButton
          onClick={handleInsightClick}
          isLoading={isLoading}
          disabled={currentData.length === 0}
          size={buttonSize}
          variant={buttonVariant}
          tooltip={error || (currentData.length === 0 ? 'No data available' : 'Get AI insights')}
        />
      </div>

      <AIInsightModal
        isOpen={isModalOpen}
        onClose={closeModal}
        cardTitle={cardTitle}
        insight={insight}
        isLoading={isLoading}
      />
    </div>
  );
};

export default AIInsightWrapper;
