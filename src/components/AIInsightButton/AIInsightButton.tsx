import React from 'react';
import { Brain, Loader2 } from 'lucide-react';

interface AIInsightButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'ghost';
  tooltip?: string;
}

const sizeClasses = {
  small: 'px-1.5 py-1 text-xs min-h-[24px]',
  medium: 'px-3 py-1.5 text-[13px] min-h-[32px]',
  large: 'px-4 py-2 text-sm min-h-[40px]',
} as const;

const variantClasses = {
  primary:
    'bg-gradient-to-br from-blue-400 to-blue-500 text-white shadow-[0_2px_4px_rgba(59,130,246,0.2)] hover:enabled:from-blue-500 hover:enabled:to-blue-600 hover:enabled:-translate-y-px hover:enabled:shadow-[0_4px_8px_rgba(59,130,246,0.3)] active:translate-y-0 active:shadow-[0_2px_4px_rgba(59,130,246,0.2)]',
  secondary:
    'bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:enabled:bg-blue-500/20 hover:enabled:border-blue-500',
  ghost:
    'bg-transparent text-muted-foreground border border-transparent hover:enabled:bg-foreground/10 hover:enabled:text-foreground',
} as const;

const AIInsightButton: React.FC<AIInsightButtonProps> = ({
  onClick,
  isLoading = false,
  disabled = false,
  size = 'medium',
  variant = 'primary',
  tooltip = 'Get AI insights'
}) => {
  return (
    <button
      className={`inline-flex items-center gap-1.5 border-none rounded-md cursor-pointer font-medium transition-all duration-200 relative outline-none no-underline font-[inherit] focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:!translate-y-0 ${sizeClasses[size]} ${variantClasses[variant]}`}
      onClick={onClick}
      disabled={disabled || isLoading}
      title={tooltip}
    >
      {isLoading ? (
        <Loader2 className="shrink-0 animate-spin" size={size === 'small' ? 14 : size === 'large' ? 20 : 16} />
      ) : (
        <Brain className="shrink-0" size={size === 'small' ? 14 : size === 'large' ? 20 : 16} />
      )}
      {size !== 'small' && (
        <span className="font-[inherit] whitespace-nowrap">
          {isLoading ? 'Analyzing...' : 'AI Insights'}
        </span>
      )}
    </button>
  );
};

export default AIInsightButton;
