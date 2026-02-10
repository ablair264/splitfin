import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  CheckCircle,

  XCircle,
  Eye,
  Download,
  Trash2,
  Sparkles,
  Zap
} from 'lucide-react';
import {
  imageProcessingService,
  BatchUploadProgress,
  ImageProcessingResult
} from '../../services/imageProcessingService';
import { productService } from '../../services/productService';

interface Brand {
  id: string;
  brand_name: string;
}

interface BatchImageUploadProps {
  onClose: () => void;
  onComplete?: (results: ImageProcessingResult[]) => void;
}

const BatchImageUpload: React.FC<BatchImageUploadProps> = ({
  onClose,
  onComplete
}) => {
  const [step, setStep] = useState<'select-brand' | 'upload-files' | 'processing' | 'results'>('select-brand');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchUploadProgress>({
    total: 0,
    processed: 0,
    current: '',
    results: [],
    errors: []
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    try {
      // Load brands from product service
      // The backend returns { brand: string, count: number }[] from /api/v1/products/brands
      // We transform this to match the Brand interface expected by the component
      const brandsResponse = await productService.getBrands();
      const transformedBrands: Brand[] = brandsResponse.map((b) => ({
        id: b.brand.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        brand_name: b.brand
      }));
      setBrands(transformedBrands);
    } catch (error) {
      console.error('Error loading brands:', error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startProcessing = async () => {
    if (!selectedBrand || selectedFiles.length === 0) return;

    setProcessing(true);
    setStep('processing');

    try {
      const finalProgress = await imageProcessingService.processBatchImages(
        selectedFiles,
        selectedBrand.brand_name,
        (currentProgress) => {
          setProgress({ ...currentProgress });
        }
      );

      setProgress(finalProgress);
      setStep('results');

      if (onComplete) {
        onComplete(finalProgress.results);
      }
    } catch (error) {
      console.error('Error processing images:', error);
    } finally {
      setProcessing(false);
    }
  };

  const downloadResults = () => {
    const csvContent = [
      'Original Filename,Final Filename,Matched SKU,Product Type,Detected Color,Confidence,Success,Error',
      ...progress.results.map(result =>
        `"${result.originalFilename}","${result.finalFilename}","${result.matchedSku || ''}","${result.productType || ''}","${result.detectedColor || ''}",${result.confidence || 0},${result.success},"${result.error || ''}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `image-processing-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderBrandSelection = () => (
    <div className="p-8 overflow-y-auto max-h-[calc(90vh-64px)] max-md:p-6 max-md:px-4">
      <div className="text-center mb-8">
        <h2 className="m-0 mb-2 text-[28px] text-white font-bold">Select Brand</h2>
        <p className="m-0 text-base text-slate-400 leading-relaxed">Choose the brand for your image uploads</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-8 max-md:grid-cols-2">
        {brands.map(brand => (
          <div
            key={brand.id}
            className={`flex flex-col items-center p-6 border-2 rounded-xl cursor-pointer transition-all duration-200 text-center ${
              selectedBrand?.id === brand.id
                ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-400 -translate-y-0.5 shadow-[0_8px_25px_rgba(59,130,246,0.3)]'
                : 'bg-slate-700 border-transparent hover:bg-slate-600 hover:border-slate-500'
            }`}
            onClick={() => setSelectedBrand(brand)}
          >
            <div className={`mb-3 p-4 rounded-full ${selectedBrand?.id === brand.id ? 'bg-white/20' : 'bg-white/10'}`}>
              <ImageIcon size={24} />
            </div>
            <span className="text-base font-semibold text-white">{brand.brand_name}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between gap-4 mt-6 pt-6 border-t border-slate-600 max-md:flex-col-reverse">
        <button
          className="py-3 px-6 border border-slate-500 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 bg-slate-600 text-slate-400 hover:bg-slate-500 hover:text-white max-md:w-full max-md:justify-center"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="py-3 px-6 border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none max-md:w-full max-md:justify-center"
          onClick={() => setStep('upload-files')}
          disabled={!selectedBrand}
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderFileUpload = () => (
    <div className="p-8 overflow-y-auto max-h-[calc(90vh-64px)] max-md:p-6 max-md:px-4">
      <div className="text-center mb-8">
        <h2 className="m-0 mb-2 text-[28px] text-white font-bold">Upload Images</h2>
        <p className="m-0 text-base text-slate-400 leading-relaxed">Upload images for <strong>{selectedBrand?.brand_name}</strong></p>
      </div>

      <div
        className="border-2 border-dashed border-slate-500 rounded-xl py-12 px-6 text-center bg-slate-700 cursor-pointer transition-all duration-200 mb-8 hover:border-slate-400 hover:bg-[#3f4c5a]"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={48} />
        <h3 className="mt-4 mb-2 text-xl text-white">Drag & drop images here</h3>
        <p className="m-0 mb-4 text-slate-400 text-base">or click to browse files</p>
        <small className="text-slate-500 text-sm">Supports: JPG, PNG, WebP, GIF</small>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {selectedFiles.length > 0 && (
        <div className="mb-8">
          <h3 className="m-0 mb-4 text-lg text-white">Selected Files ({selectedFiles.length})</h3>
          <div className="max-h-[200px] overflow-y-auto bg-slate-700 rounded-lg p-4">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-slate-600 last:border-b-0">
                <div className="flex items-center gap-2 flex-1">
                  <ImageIcon size={16} />
                  <span className="text-white font-medium flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
                  <span className="text-slate-400 text-xs min-w-[60px] text-right">{formatFileSize(file.size)}</span>
                </div>
                <button
                  className="bg-none border-none text-red-500 cursor-pointer p-1 rounded transition-all duration-200 hover:bg-red-500/10"
                  onClick={() => removeFile(index)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 p-6 bg-gradient-to-br from-slate-800 to-slate-700 rounded-xl border border-slate-600">
        <h3 className="m-0 mb-4 text-white text-base">AI Processing Pipeline:</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 max-md:grid-cols-1">
          <div className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <Zap size={20} />
            <div>
              <strong className="text-white text-sm mb-1 block">SKU Matching</strong>
              <p className="m-0 text-slate-400 text-xs leading-relaxed">Smart filename analysis to match product SKUs</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <Sparkles size={20} />
            <div>
              <strong className="text-white text-sm mb-1 block">WebP Conversion</strong>
              <p className="m-0 text-slate-400 text-xs leading-relaxed">Optimized format for better performance</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <Eye size={20} />
            <div>
              <strong className="text-white text-sm mb-1 block">AI Analysis</strong>
              <p className="m-0 text-slate-400 text-xs leading-relaxed">Product type and color detection</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <Upload size={20} />
            <div>
              <strong className="text-white text-sm mb-1 block">Cloud Storage</strong>
              <p className="m-0 text-slate-400 text-xs leading-relaxed">Organized by brand on Cloudflare R2</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-4 mt-6 pt-6 border-t border-slate-600 max-md:flex-col-reverse">
        <button
          className="py-3 px-6 border border-slate-500 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 bg-slate-600 text-slate-400 hover:bg-slate-500 hover:text-white max-md:w-full max-md:justify-center"
          onClick={() => setStep('select-brand')}
        >
          Back
        </button>
        <button
          className="py-3 px-6 border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none max-md:w-full max-md:justify-center"
          onClick={startProcessing}
          disabled={selectedFiles.length === 0}
        >
          Process {selectedFiles.length} Images
        </button>
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="p-8 overflow-y-auto max-h-[calc(90vh-64px)] max-md:p-6 max-md:px-4">
      <div className="text-center mb-8">
        <h2 className="m-0 mb-2 text-[28px] text-white font-bold">AI Processing in Progress</h2>
        <p className="m-0 text-base text-slate-400 leading-relaxed">Processing images with AI-powered analysis...</p>
      </div>

      <div className="mb-8">
        <div className="w-full h-2 bg-slate-700 rounded overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-700 rounded transition-[width] duration-300"
            style={{ width: `${(progress.processed / progress.total) * 100}%` }}
          />
        </div>

        <div className="flex justify-between text-sm text-slate-400 mb-4">
          <span>{progress.processed} / {progress.total} processed</span>
          <span>{Math.round((progress.processed / progress.total) * 100)}%</span>
        </div>

        {progress.current && (
          <div className="text-center p-4 bg-slate-700 rounded-lg mb-6">
            <span>Processing: <strong>{progress.current}</strong></span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <CheckCircle className="text-emerald-500" size={20} />
          <span>SKU Matching & Filename Generation</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <CheckCircle className="text-emerald-500" size={20} />
          <span>WebP Conversion & Optimization</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <CheckCircle className="text-emerald-500" size={20} />
          <span>AI Product Analysis</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <CheckCircle className="text-emerald-500" size={20} />
          <span>Cloud Storage Upload (R2)</span>
        </div>
      </div>
    </div>
  );

  const renderResults = () => {
    const successCount = progress.results.filter(r => r.success).length;
    const failureCount = progress.results.filter(r => !r.success).length;

    return (
      <div className="p-8 overflow-y-auto max-h-[calc(90vh-64px)] max-md:p-6 max-md:px-4">
        <div className="text-center mb-8">
          <h2 className="m-0 mb-2 text-[28px] text-white font-bold">Processing Complete!</h2>
          <p className="m-0 text-base text-slate-400 leading-relaxed">Processed {progress.total} images for <strong>{selectedBrand?.brand_name}</strong></p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-8 max-md:grid-cols-1">
          <div className="flex items-center gap-4 p-5 bg-slate-700 rounded-xl border border-slate-600">
            <CheckCircle className="text-emerald-500" size={24} />
            <div>
              <span className="text-2xl font-bold text-white block">{successCount}</span>
              <span className="text-xs text-slate-400 uppercase tracking-wider">Successful</span>
            </div>
          </div>
          <div className="flex items-center gap-4 p-5 bg-slate-700 rounded-xl border border-slate-600">
            <XCircle className="text-red-500" size={24} />
            <div>
              <span className="text-2xl font-bold text-white block">{failureCount}</span>
              <span className="text-xs text-slate-400 uppercase tracking-wider">Failed</span>
            </div>
          </div>
          <div className="flex items-center gap-4 p-5 bg-slate-700 rounded-xl border border-slate-600">
            <Eye className="text-blue-500" size={24} />
            <div>
              <span className="text-2xl font-bold text-white block">
                {(progress.results.reduce((sum, r) => sum + (r.confidence || 0), 0) / progress.results.length * 100).toFixed(0)}%
              </span>
              <span className="text-xs text-slate-400 uppercase tracking-wider">Avg Confidence</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-700 rounded-lg overflow-hidden mb-8 max-h-[400px] overflow-y-auto">
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr] gap-4 p-4 bg-slate-600 font-semibold text-xs uppercase text-slate-400 tracking-wider border-b border-slate-500 max-md:grid-cols-[2fr_1fr_1fr_1fr] max-md:text-[11px] max-sm:grid-cols-[2fr_1fr_1fr]">
            <span>Original File</span>
            <span>Final File</span>
            <span>SKU</span>
            <span>Product Type</span>
            <span>Color</span>
            <span>Status</span>
          </div>
          <div className="flex flex-col">
            {progress.results.map((result, index) => (
              <div key={index} className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr] gap-4 py-3 px-4 border-b border-white/10 text-[13px] items-center hover:bg-white/[0.02] max-md:grid-cols-[2fr_1fr_1fr_1fr] max-md:text-[11px] max-sm:grid-cols-[2fr_1fr_1fr]">
                <span className="text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap">{result.originalFilename}</span>
                <span className="text-white font-medium overflow-hidden text-ellipsis whitespace-nowrap">{result.finalFilename || '-'}</span>
                <span className="text-blue-500 font-medium">{result.matchedSku || '-'}</span>
                <span>{result.productType || '-'}</span>
                <span>{result.detectedColor || '-'}</span>
                <div className="flex items-center gap-1.5">
                  {result.success ? (
                    <CheckCircle className="text-emerald-500" size={16} />
                  ) : (
                    <XCircle className="text-red-500" size={16} />
                  )}
                  <span className={result.success ? 'text-emerald-500 text-xs' : 'text-red-500 text-xs'}>
                    {result.success ? 'Success' : 'Failed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-4 mt-6 pt-6 border-t border-slate-600 max-md:flex-col-reverse">
          <button
            className="py-3 px-6 border border-slate-500 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 bg-slate-600 text-slate-400 hover:bg-slate-500 hover:text-white max-md:w-full max-md:justify-center"
            onClick={downloadResults}
          >
            <Download size={16} />
            Download Results
          </button>
          <button
            className="py-3 px-6 border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)] max-md:w-full max-md:justify-center"
            onClick={onClose}
          >
            Complete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.3)] w-full max-w-[1000px] max-h-[90vh] overflow-hidden flex flex-col text-white max-md:max-w-full max-md:m-0 max-md:rounded-none max-md:h-screen max-md:max-h-screen">
        <button
          className="absolute top-4 right-4 bg-none border-none text-2xl cursor-pointer text-slate-400 z-10 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          x
        </button>

        {step === 'select-brand' && renderBrandSelection()}
        {step === 'upload-files' && renderFileUpload()}
        {step === 'processing' && renderProcessing()}
        {step === 'results' && renderResults()}
      </div>
    </div>
  );
};

export default BatchImageUpload;
