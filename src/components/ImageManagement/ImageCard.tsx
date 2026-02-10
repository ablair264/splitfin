import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Copy, Check, Eye, Trash2, X, ImageOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProductImage } from '@/types/domain';

interface ImageCardProps {
  image: ProductImage;
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
  onDelete: () => void;
  anySelected: boolean;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function ImageCard({ image, selected, onSelect, onView, onDelete, anySelected }: ImageCardProps) {
  const [imgError, setImgError] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleCopyUrl = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(image.url);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch { /* ignore */ }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className={`group relative rounded-lg border bg-card overflow-hidden transition-all cursor-pointer ${
        selected ? 'ring-2 ring-teal-500 border-teal-500/40' : 'border-border hover:border-border/80'
      }`}
      onClick={onView}
    >
      {/* Checkbox */}
      <div
        className={`absolute top-2 right-2 z-10 transition-opacity ${
          anySelected || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <div className={`size-5 rounded border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-teal-500 border-teal-500' : 'bg-card/80 border-muted-foreground/40 backdrop-blur-sm'
        }`}>
          {selected && <Check className="size-3 text-white" />}
        </div>
      </div>

      {/* Brand badge */}
      <div className="absolute top-2 left-2 z-10">
        <Badge variant="outline" className="text-[9px] bg-card/80 backdrop-blur-sm border-border/60">
          {image.brand}
        </Badge>
      </div>

      {/* Image */}
      <div className="aspect-square bg-muted/30">
        {!imgError ? (
          <img
            src={image.url}
            alt={image.filename}
            className="size-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="size-full flex flex-col items-center justify-center text-muted-foreground">
            <ImageOff className="size-6 mb-1" />
            <span className="text-[10px]">Failed</span>
          </div>
        )}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onView(); }}
          className="size-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          title="View"
        >
          <Eye className="size-4" />
        </button>
        <button
          onClick={handleDownload}
          className="size-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          title="Download"
        >
          <Download className="size-4" />
        </button>
        <button
          onClick={handleCopyUrl}
          className="size-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          title="Copy URL"
        >
          {copying ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="size-8 rounded-full bg-red-500/30 hover:bg-red-500/50 flex items-center justify-center text-white transition-colors"
          title="Delete"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* Footer */}
      <div className="px-2 py-1.5 border-t border-border/50">
        <p className="text-xs font-medium text-foreground truncate" title={image.filename}>
          {image.filename}
        </p>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>{formatFileSize(image.size_bytes)}</span>
          {image.matched_sku && (
            <span className="text-teal-400 font-medium">{image.matched_sku}</span>
          )}
        </div>
      </div>
    </div>
  );
}
