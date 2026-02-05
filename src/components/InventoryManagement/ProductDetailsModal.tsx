import React from 'react';
import {
  X,
  Package,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import type { Product } from '../../types/domain';
import { cn } from '@/lib/utils';

interface ProductDetailsModalProps {
  product: Product;
  onClose: () => void;
}

const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ product, onClose }) => {
  const [copiedSku, setCopiedSku] = React.useState(false);

  const getStockStatus = () => {
    if (product.stock_on_hand === 0) {
      return { label: 'Out of Stock', color: 'red' as const, Icon: XCircle };
    }
    if (product.stock_on_hand <= 10) {
      return { label: 'Low Stock', color: 'amber' as const, Icon: AlertTriangle };
    }
    return { label: 'In Stock', color: 'emerald' as const, Icon: CheckCircle };
  };

  const stockStatus = getStockStatus();

  const formatCurrency = (value: number | null | undefined) => {
    if (value === undefined || value === null) return '—';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(value);
  };

  const calculateMargin = () => {
    if (!product.rate || !product.rrp || product.rate === 0) return null;
    return ((product.rrp - product.rate) / product.rate * 100).toFixed(0);
  };

  const margin = calculateMargin();

  const copySku = async () => {
    await navigator.clipboard.writeText(product.sku);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 1500);
  };

  const displayDescription = product.ai_description || product.description;
  const isAiDescription = !!product.ai_description;

  const colorMap = {
    red: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
    },
    amber: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
    },
    emerald: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
    },
  };

  const statusColors = colorMap[stockStatus.color];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-[#1a1f2a] rounded-xl border border-gray-700 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-700">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white leading-tight line-clamp-2">
              {product.name}
            </h2>
            {/* Meta strip */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                onClick={copySku}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[11px] font-mono text-gray-300 hover:border-gray-600 transition-colors"
                title="Copy SKU"
              >
                {copiedSku ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                {product.sku}
              </button>
              {product.ean && (
                <span className="px-2 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-[11px] font-mono text-gray-400">
                  EAN: {product.ean}
                </span>
              )}
              {product.brand && (
                <span className="px-2 py-0.5 rounded bg-brand-300/10 border border-brand-300/20 text-[11px] font-medium text-brand-300">
                  {product.brand}
                </span>
              )}
              {product.category_name && (
                <span className="px-2 py-0.5 rounded bg-gray-800/50 text-[11px] text-gray-400">
                  {product.category_name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Stock status badge */}
            <div className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium border',
              statusColors.bg,
              statusColors.border,
              statusColors.text
            )}>
              <stockStatus.Icon size={14} />
              {stockStatus.label}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex gap-5">
            {/* Image */}
            {product.image_url ? (
              <div className="shrink-0">
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-40 h-40 object-contain rounded-lg border border-gray-700 bg-white"
                />
              </div>
            ) : (
              <div className="shrink-0 w-40 h-40 rounded-lg border border-gray-700 bg-[#0f1419] flex items-center justify-center">
                <Package size={32} className="text-gray-600" />
              </div>
            )}

            {/* Key metrics */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              {/* Stock */}
              <div className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Stock</div>
                <div className={cn(
                  'text-xl font-semibold tabular-nums',
                  product.stock_on_hand === 0 ? 'text-red-400' :
                  product.stock_on_hand <= 10 ? 'text-amber-400' : 'text-white'
                )}>
                  {product.stock_on_hand.toLocaleString()}
                </div>
                {product.unit && (
                  <div className="text-[11px] text-gray-500">{product.unit}</div>
                )}
              </div>

              {/* Cost */}
              <div className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Cost</div>
                <div className="text-xl font-semibold text-white tabular-nums">
                  {formatCurrency(product.rate)}
                </div>
              </div>

              {/* RRP */}
              <div className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">RRP</div>
                <div className="text-xl font-semibold text-emerald-400 tabular-nums">
                  {formatCurrency(product.rrp)}
                </div>
              </div>

              {/* Margin */}
              <div className="bg-[#0f1419] rounded-lg border border-gray-700/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Margin</div>
                <div className={cn(
                  'text-xl font-semibold tabular-nums',
                  margin && parseInt(margin) > 30 ? 'text-emerald-400' :
                  margin && parseInt(margin) > 15 ? 'text-white' : 'text-amber-400'
                )}>
                  {margin ? `${margin}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Additional details */}
          {(product.pack_qty || product.dimensions_formatted || product.materials || product.color_family) && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
              {product.pack_qty && (
                <div>
                  <span className="text-gray-500">Pack Qty:</span>{' '}
                  <span className="text-gray-300">{product.pack_qty}</span>
                </div>
              )}
              {product.dimensions_formatted && (
                <div>
                  <span className="text-gray-500">Dimensions:</span>{' '}
                  <span className="text-gray-300">{product.dimensions_formatted}</span>
                </div>
              )}
              {product.materials && (
                <div>
                  <span className="text-gray-500">Materials:</span>{' '}
                  <span className="text-gray-300">{product.materials}</span>
                </div>
              )}
              {product.color_family && (
                <div>
                  <span className="text-gray-500">Color:</span>{' '}
                  <span className="text-gray-300">{product.color_family}</span>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {displayDescription && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider">
                  Description
                </h3>
                {isAiDescription && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-brand-300/10 text-brand-300 border border-brand-300/20">
                    <Sparkles size={10} />
                    AI Generated
                  </span>
                )}
              </div>
              <p className="text-[13px] text-gray-300 leading-relaxed">
                {displayDescription}
              </p>
            </div>
          )}

          {/* AI Features */}
          {product.ai_features && product.ai_features.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                Features
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-brand-300/10 text-brand-300 border border-brand-300/20">
                  <Sparkles size={10} />
                  AI
                </span>
              </h3>
              <ul className="space-y-1">
                {product.ai_features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-gray-300">
                    <span className="text-brand-300 mt-1">•</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Category hierarchy */}
          {(product.category_l1 || product.category_l2 || product.category_l3) && (
            <div className="mt-4 pt-4 border-t border-gray-700/50">
              <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                Category Path
              </h3>
              <div className="flex items-center gap-1.5 text-[12px] text-gray-400">
                {product.category_l1 && <span>{product.category_l1}</span>}
                {product.category_l2 && (
                  <>
                    <span className="text-gray-600">/</span>
                    <span>{product.category_l2}</span>
                  </>
                )}
                {product.category_l3 && (
                  <>
                    <span className="text-gray-600">/</span>
                    <span>{product.category_l3}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Zoho link */}
          {product.zoho_item_id && (
            <div className="mt-4 pt-4 border-t border-gray-700/50">
              <a
                href={`https://inventory.zoho.eu/app#/items/${product.zoho_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-brand-300 transition-colors"
              >
                <ExternalLink size={12} />
                View in Zoho Inventory
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailsModal;
