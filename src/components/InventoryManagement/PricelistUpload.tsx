import React, { useState, useCallback } from 'react';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Eye,
  X,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { pricelistProcessingService } from '../../services/pricelistProcessingService';
import {
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PricelistFile {
  id: string;
  file: File;
  supplier: string;
  brand: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  preview?: any[];
  changes?: PriceChange[];
  error?: string;
}

interface PriceChange {
  sku: string;
  product_name: string;
  current_price?: number;
  new_price: number;
  price_change: number;
  price_change_percent: number;
  action: 'update' | 'create';
  confidence: number;
}

interface PricelistUploadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}

const PricelistUploadSheet: React.FC<PricelistUploadSheetProps> = ({ open, onOpenChange, onApplied }) => {
  const [files, setFiles] = useState<PricelistFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      handleFiles(selectedFiles);
    }
  }, []);

  const handleFiles = async (fileList: File[]) => {
    const validFiles = fileList.filter(file => {
      const extension = file.name.toLowerCase().split('.').pop();
      return ['csv', 'xlsx', 'xls', 'pdf'].includes(extension || '');
    });

    for (const file of validFiles) {
      const fileId = Date.now().toString() + Math.random().toString(36);
      const pricelistFile: PricelistFile = {
        id: fileId,
        file,
        supplier: detectSupplier(file.name),
        brand: detectBrand(file.name),
        status: 'uploading'
      };

      setFiles(prev => [...prev, pricelistFile]);

      try {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'processing' } : f
        ));

        const result = await pricelistProcessingService.processFile(file);

        setFiles(prev => prev.map(f =>
          f.id === fileId ? {
            ...f,
            status: 'ready',
            preview: result.preview,
            changes: result.changes
          } : f
        ));

      } catch (error) {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? {
            ...f,
            status: 'error',
            error: error instanceof Error ? error.message : 'Processing failed'
          } : f
        ));
      }
    }
  };

  const detectSupplier = (filename: string): string => {
    const name = filename.toLowerCase();
    if (name.includes('rader')) return 'Rader';
    if (name.includes('elvang')) return 'Elvang';
    if (name.includes('myflame') || name.includes('my-flame')) return 'My Flame';
    if (name.includes('remember')) return 'Remember';
    if (name.includes('relaxound')) return 'Relaxound';
    if (name.includes('gefu')) return 'GEFU';
    return 'Unknown';
  };

  const detectBrand = (filename: string): string => {
    return detectSupplier(filename);
  };

  const handleApplyChanges = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || !file.changes) return;

    setApplying(fileId);
    try {
      await pricelistProcessingService.applyChanges(file.changes);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      onApplied?.();
    } catch (error) {
      console.error('Failed to apply changes:', error);
    } finally {
      setApplying(null);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const selectedFileData = selectedFile ? files.find(f => f.id === selectedFile) : null;

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={onOpenChange}
      side="right"
      isFloat={false}
      className="sm:max-w-2xl w-full"
      aria-label="Supplier pricelist upload"
    >
      <SheetHeader className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5 pr-6">
          <Sparkles size={18} className="text-brand-300" />
          <h2 className="text-base font-semibold text-foreground">Supplier Pricelist Upload</h2>
        </div>
      </SheetHeader>

      <SheetBody className="px-5 py-4 overflow-y-auto">
        {selectedFile ? (
          /* Preview Mode */
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSelectedFile(null)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                &larr; Back to Upload
              </button>
              <h3 className="text-sm font-medium text-foreground truncate">{selectedFileData?.file.name}</h3>
            </div>

            {selectedFileData && (
              <PriceChangePreview
                file={selectedFileData}
                onApply={() => handleApplyChanges(selectedFile)}
                applying={applying === selectedFile}
              />
            )}
          </div>
        ) : (
          /* Upload Mode */
          <>
            <div
              className={cn(
                'border-2 border-dashed rounded-xl p-12 text-center transition-colors',
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background'
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload size={48} className="mx-auto mb-3 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground mb-1">Drop supplier pricelists here</h3>
              <p className="text-xs text-muted-foreground mb-3">Supports CSV, Excel (.xlsx, .xls), and PDF files</p>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-4">
                <Sparkles size={14} className="text-brand-300" />
                AI will automatically detect supplier, extract products, and match to your inventory
              </p>

              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.pdf"
                onChange={handleFileInput}
                className="hidden"
                id="pricelist-file-input"
              />
              <label htmlFor="pricelist-file-input">
                <Button intent="outline" size="sm" className="pointer-events-none">
                  Choose Files
                </Button>
              </label>
            </div>

            {files.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Processing Files</h3>
                <div className="space-y-2">
                  {files.map(file => (
                    <FileStatus
                      key={file.id}
                      file={file}
                      onPreview={() => setSelectedFile(file.id)}
                      onRemove={() => removeFile(file.id)}
                      onApply={() => handleApplyChanges(file.id)}
                      applying={applying === file.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </SheetBody>

      <SheetFooter className="border-t border-border px-5 py-3">
        <div className="flex items-center justify-end w-full">
          <Button intent="outline" size="sm" onPress={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </SheetFooter>
    </SheetContent>
  );
};

const FileStatus: React.FC<{
  file: PricelistFile;
  onPreview: () => void;
  onRemove: () => void;
  onApply: () => void;
  applying: boolean;
}> = ({ file, onPreview, onRemove, onApply, applying }) => {
  const getStatusIcon = () => {
    switch (file.status) {
      case 'uploading':
      case 'processing':
        return <RefreshCw size={14} className="animate-spin text-brand-300" />;
      case 'ready':
        return <CheckCircle size={14} className="text-success" />;
      case 'error':
        return <AlertCircle size={14} className="text-destructive" />;
    }
  };

  const getStatusText = () => {
    switch (file.status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'AI processing...';
      case 'ready':
        return `Ready - ${file.changes?.length || 0} changes found`;
      case 'error':
        return file.error || 'Processing failed';
    }
  };

  const borderColor = file.status === 'ready'
    ? 'border-success/20'
    : file.status === 'error'
      ? 'border-destructive/20'
      : 'border-border';

  return (
    <div className={cn('bg-card rounded-lg border p-4', borderColor)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <FileText size={18} className="text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{file.file.name}</div>
            <div className="text-[11px] text-muted-foreground">{file.supplier} &bull; {file.brand}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              {getStatusIcon()}
              <span className={file.status === 'error' ? 'text-destructive' : ''}>{getStatusText()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {file.status === 'ready' && (
            <>
              <Button intent="outline" size="sq-xs" onPress={onPreview}>
                <Eye size={14} />
              </Button>
              <Button
                intent="primary"
                size="xs"
                onPress={onApply}
                isDisabled={applying}
              >
                {applying ? <RefreshCw size={12} className="animate-spin mr-1" /> : <CheckCircle size={12} className="mr-1" />}
                {applying ? 'Applying...' : 'Apply'}
              </Button>
            </>
          )}
          <button
            onClick={onRemove}
            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const PriceChangePreview: React.FC<{
  file: PricelistFile;
  onApply: () => void;
  applying: boolean;
}> = ({ file, onApply, applying }) => {
  if (!file.changes) return null;

  const totalChanges = file.changes.length;
  const priceIncreases = file.changes.filter(c => c.price_change > 0).length;
  const priceDecreases = file.changes.filter(c => c.price_change < 0).length;
  const newProducts = file.changes.filter(c => c.action === 'create').length;

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-muted/30 rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-semibold text-foreground tabular-nums">{totalChanges}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
        </div>
        <div className="bg-muted/30 rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-semibold text-primary tabular-nums">{newProducts}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">New</div>
        </div>
        <div className="bg-muted/30 rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-semibold text-warning tabular-nums">{priceIncreases}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Increases</div>
        </div>
        <div className="bg-muted/30 rounded-lg border border-border p-3 text-center">
          <div className="text-lg font-semibold text-success tabular-nums">{priceDecreases}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Decreases</div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Button
          intent="primary"
          size="sm"
          onPress={onApply}
          isDisabled={applying}
        >
          {applying ? <RefreshCw size={14} className="animate-spin mr-1" /> : <CheckCircle size={14} className="mr-1" />}
          {applying ? 'Applying Changes...' : 'Apply All Changes'}
        </Button>
      </div>

      {/* Changes List */}
      <div className="space-y-1.5">
        {file.changes.map((change, index) => (
          <div key={index} className={cn(
            'flex items-center justify-between gap-3 rounded-lg border p-3',
            change.action === 'create'
              ? 'border-primary/20 bg-primary/5'
              : 'border-border bg-card'
          )}>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground font-mono">{change.sku}</div>
              <div className="text-sm text-foreground truncate">{change.product_name}</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {change.action === 'update' && change.current_price != null && (
                <>
                  <span className="text-xs text-muted-foreground tabular-nums">&pound;{change.current_price.toFixed(2)}</span>
                  <span className="text-muted-foreground/50">&rarr;</span>
                </>
              )}
              <span className="text-sm font-medium text-foreground tabular-nums">&pound;{change.new_price.toFixed(2)}</span>
              {change.action === 'update' && (
                <span className={cn(
                  'text-xs tabular-nums',
                  change.price_change > 0 ? 'text-warning' : 'text-success'
                )}>
                  {change.price_change > 0 ? '+' : ''}&pound;{change.price_change.toFixed(2)} ({change.price_change_percent.toFixed(1)}%)
                </span>
              )}
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                change.action === 'create'
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-muted text-muted-foreground border-border'
              )}>
                {change.action === 'create' ? 'New' : 'Update'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PricelistUploadSheet;
