import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productService } from '../../services/productService';
import { authService } from '../../services/authService';
import { ProgressLoader } from '../ProgressLoader';
import ImageCard from './ImageCard';
import ImageUploadModal from './ImageUploadModal';
import BatchImageUpload from './BatchImageUpload';
import { ImageItem, Brand } from './types';

// TODO: Image storage operations need backend implementation
// The backend needs endpoints for:
// 1. GET /api/v1/images - List images with brand filtering
// 2. GET /api/v1/images/:brandId - List images for a specific brand
// 3. DELETE /api/v1/images/:id - Delete an image
// 4. POST /api/v1/images/upload - Upload new image (multipart/form-data)
// These endpoints should interface with ImageKit or similar cloud storage

const IMAGES_PER_PAGE = 50;

const ImageManagement: React.FC = () => {
  const { brandId } = useParams<{ brandId?: string }>();
  const navigate = useNavigate();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserAndData();
  }, [brandId]);

  const loadUserAndData = async () => {
    try {
      // Load user from auth service
      const agent = authService.getCachedAgent();
      if (agent) {
        setAgentId(agent.id);
      }

      await loadData();
    } catch (error) {
      console.error('Error loading user data:', error);
      await loadData(); // Still try to load data
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load brands from product service
      // The backend returns { brand: string, count: number }[] from /api/v1/products/brands
      // We transform this to match the Brand interface expected by the component
      const brandsResponse = await productService.getBrands();
      const transformedBrands: Brand[] = brandsResponse.map((b, index) => ({
        id: b.brand.toLowerCase().replace(/[^a-z0-9]/g, '-'), // Generate ID from brand name
        brand_name: b.brand,
        brand_normalized: b.brand.toLowerCase().replace(/[^a-z0-9]/g, ''),
        is_active: true
      }));
      setBrands(transformedBrands);

      // TODO: Load images from backend API
      // For now, images list is empty as storage operations need backend implementation
      // When implemented, this would call something like:
      // const imagesResponse = await imageService.list({ brandId });
      // setImages(imagesResponse.data);
      const imageItems: ImageItem[] = [];

      // Placeholder: In future, load images from backend storage API
      console.warn('Image listing not yet implemented - backend storage API needed');

      setImages(imageItems);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCurrentPage(1);
    await loadData();
    setRefreshing(false);
  }, [brandId]);

  const handleUploadSuccess = useCallback(async () => {
    setShowUploadModal(false);
    await handleRefresh();
  }, [handleRefresh]);

  const handleBrandClick = useCallback((brandIdToSelect: string) => {
    navigate(brandIdToSelect === 'all' ? '/images' : `/images/${brandIdToSelect}`);
  }, [navigate]);

  const handleDeleteImage = useCallback(async (imageId: string) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    try {
      const image = images.find(img => img.id === imageId);
      if (!image) return;

      // TODO: Delete via backend API
      // await imageService.delete(imageId);
      console.warn('Image deletion not yet implemented - backend API needed');

      setImages(prev => prev.filter(img => img.id !== imageId));
      setSelectedImages(prev => prev.filter(id => id !== imageId));
    } catch (err) {
      console.error('Error deleting image:', err);
      alert('Failed to delete image');
    }
  }, [images]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedImages.length === 0) return;
    const confirmMessage = `Are you sure you want to delete ${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''}?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      // TODO: Bulk delete via backend API
      // await imageService.bulkDelete(selectedImages);
      console.warn('Bulk image deletion not yet implemented - backend API needed');

      setImages(prev => prev.filter(img => !selectedImages.includes(img.id)));
      setSelectedImages([]);
    } catch (err) {
      console.error('Error deleting images:', err);
      alert('Failed to delete images');
    }
  }, [selectedImages, images]);

  const handleSelectImage = useCallback((imageId: string) => {
    setSelectedImages(prev =>
      prev.includes(imageId)
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    const currentImageIds = currentImages.map(img => img.id);
    const allSelected = currentImageIds.every(id => selectedImages.includes(id));
    if (allSelected) {
      setSelectedImages(prev => prev.filter(id => !currentImageIds.includes(id)));
    } else {
      setSelectedImages(prev => Array.from(new Set([...prev, ...currentImageIds])));
    }
  }, []);

  // Memoized data processing
  const processedImages = useMemo(() => {
    let filtered = [...images];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(img =>
        img.name.toLowerCase().includes(query) ||
        img.brand_name.toLowerCase().includes(query)
      );
    }

    // Sort images
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
        case 'size':
          return b.size - a.size;
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [images, searchQuery, sortBy]);

  // Pagination
  const totalPages = Math.ceil(processedImages.length / IMAGES_PER_PAGE);
  const currentImages = processedImages.slice(
    (currentPage - 1) * IMAGES_PER_PAGE,
    currentPage * IMAGES_PER_PAGE
  );

  const stats = useMemo(() => {
    const totalSize = images.reduce((sum, img) => sum + img.size, 0);
    const brandCounts = brands.map(brand => ({
      ...brand,
      count: images.filter(img => img.brand_id === brand.id).length
    }));
    const activeBrands = brandCounts.filter(b => b.count > 0).length;
    return { totalSize, brandCounts, activeBrands };
  }, [images, brands]);

  const allDisplayedSelected = currentImages.length > 0 && currentImages.every(img => selectedImages.includes(img.id));

  return (
    <div className="min-h-screen p-8 bg-background max-md:p-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 px-2 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-br from-primary to-primary bg-clip-text text-transparent max-md:text-2xl max-sm:text-xl">
            Image Management{brandId ? ` - ${brands.find(b => b.id === brandId)?.brand_name}` : ''}
          </h1>
          <p className="text-[0.95rem] text-muted-foreground">
            {brandId ? `Manage product images for ${brands.find(b => b.id === brandId)?.brand_name}` : 'Manage product images across all brands'}
          </p>
        </div>
        <div className="flex gap-4 items-center flex-wrap max-sm:w-full max-sm:justify-between">
          <button
            className="flex items-center gap-2 py-3 px-6 bg-gradient-to-br from-[hsl(var(--info))] to-[hsl(var(--chart-5))] text-[hsl(var(--info-foreground))] border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-300 shadow-md relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setShowBatchUpload(true)}
            disabled={!agentId}
          >
            <span>AI</span> AI Batch Upload
          </button>
          <button
            className="flex items-center gap-2 py-3 px-6 bg-primary text-background border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-300 shadow-md hover:shadow-lg max-md:py-2.5 max-md:px-4 max-md:text-[0.813rem]"
            onClick={() => setShowUploadModal(true)}
          >
            <span className="max-sm:hidden">Upload</span> Upload Images
          </button>
          <button
            className={`w-10 h-10 flex items-center justify-center bg-foreground/5 border border-foreground/10 rounded-lg cursor-pointer transition-all duration-300 text-foreground/70 hover:bg-foreground/[0.08] hover:border-primary hover:text-primary ${refreshing ? 'rotate-45' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <span className="text-base transition-transform duration-200">Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-4 text-destructive flex justify-between items-center">
          <span>Warning: {error}</span>
          <button
            className="bg-destructive/20 border border-destructive/30 rounded-md text-destructive py-1.5 px-3 cursor-pointer transition-all duration-200 hover:bg-destructive/30"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5 mb-8 max-md:grid-cols-2 max-sm:grid-cols-1">
        <div className="bg-card border border-foreground/10 rounded-2xl p-6 flex items-center gap-4 transition-all duration-300 relative overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:border-primary/30 max-md:p-5">
          <div className="text-2xl w-14 h-14 flex items-center justify-center bg-foreground/5 rounded-xl shrink-0 max-md:text-xl max-md:w-12 max-md:h-12">Images</div>
          <div>
            <h3 className="text-[0.813rem] text-foreground/60 uppercase tracking-wide m-0">Total Images</h3>
            <p className="text-2xl font-bold mt-1 mb-0 text-foreground max-md:text-xl">{images.length}</p>
          </div>
        </div>
        <div className="bg-card border border-foreground/10 rounded-2xl p-6 flex items-center gap-4 transition-all duration-300 relative overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:border-primary/30 max-md:p-5">
          <div className="text-2xl w-14 h-14 flex items-center justify-center bg-foreground/5 rounded-xl shrink-0 max-md:text-xl max-md:w-12 max-md:h-12">Size</div>
          <div>
            <h3 className="text-[0.813rem] text-foreground/60 uppercase tracking-wide m-0">Total Size</h3>
            <p className="text-2xl font-bold mt-1 mb-0 text-foreground max-md:text-xl">
              {(stats.totalSize / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
        <div className="bg-card border border-foreground/10 rounded-2xl p-6 flex items-center gap-4 transition-all duration-300 relative overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:border-primary/30 max-md:p-5">
          <div className="text-2xl w-14 h-14 flex items-center justify-center bg-foreground/5 rounded-xl shrink-0 max-md:text-xl max-md:w-12 max-md:h-12">Brands</div>
          <div>
            <h3 className="text-[0.813rem] text-foreground/60 uppercase tracking-wide m-0">Active Brands</h3>
            <p className="text-2xl font-bold mt-1 mb-0 text-foreground max-md:text-xl">
              {stats.activeBrands} / {brands.length}
            </p>
          </div>
        </div>
        <div className="bg-card border border-foreground/10 rounded-2xl p-6 flex items-center gap-4 transition-all duration-300 relative overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:border-primary/30 max-md:p-5">
          <div className="text-2xl w-14 h-14 flex items-center justify-center bg-foreground/5 rounded-xl shrink-0 max-md:text-xl max-md:w-12 max-md:h-12">View</div>
          <div>
            <h3 className="text-[0.813rem] text-foreground/60 uppercase tracking-wide m-0">Showing</h3>
            <p className="text-2xl font-bold mt-1 mb-0 text-foreground max-md:text-xl">
              {currentImages.length} / {processedImages.length}
            </p>
          </div>
        </div>
      </div>

      {/* Brand Filter Pills */}
      {!brandId && (
        <div className="flex gap-3 flex-wrap mb-8 p-6 bg-foreground/[0.03] rounded-xl border border-foreground/5 max-sm:gap-2 max-sm:p-3">
          <button
            className={`py-2 px-4 rounded-full border text-[0.813rem] font-medium cursor-pointer transition-all duration-300 whitespace-nowrap max-sm:py-1.5 max-sm:px-3 max-sm:text-xs ${
              !brandId
                ? 'bg-primary text-background border-transparent shadow-[0_2px_8px] shadow-primary/30'
                : 'border-foreground/10 bg-foreground/5 text-foreground/70 hover:bg-foreground/[0.08] hover:text-foreground'
            }`}
            onClick={() => handleBrandClick('all')}
          >
            All Brands ({images.length})
          </button>
          {stats.brandCounts.map(brand => (
            <button
              key={brand.id}
              className={`py-2 px-4 rounded-full border text-[0.813rem] font-medium cursor-pointer transition-all duration-300 whitespace-nowrap max-sm:py-1.5 max-sm:px-3 max-sm:text-xs ${
                brandId === brand.id
                  ? 'bg-primary text-background border-transparent shadow-[0_2px_8px] shadow-primary/30'
                  : 'border-foreground/10 bg-foreground/5 text-foreground/70 hover:bg-foreground/[0.08] hover:text-foreground'
              }`}
              onClick={() => handleBrandClick(brand.id)}
              style={{ '--brand-color': 'var(--primary)' } as React.CSSProperties}
            >
              {brand.brand_name} ({brand.count})
            </button>
          ))}
        </div>
      )}

      {/* Controls Section */}
      <div className="flex gap-4 mb-6 items-center flex-wrap px-2 max-sm:flex-col max-sm:items-stretch">
        <div className="relative flex-1 min-w-[300px] max-sm:min-w-0">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base opacity-50 pointer-events-none">Search</span>
          <input
            type="text"
            className="w-full py-3 pr-10 pl-11 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground text-sm transition-all duration-300 placeholder:text-foreground/40 focus:outline-none focus:bg-foreground/[0.08] focus:border-primary focus:shadow-[0_0_0_3px] focus:shadow-primary/10"
            placeholder="Search images by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-none border-none text-foreground/50 cursor-pointer text-base p-1 transition-colors duration-200 hover:text-foreground"
              onClick={() => setSearchQuery('')}
            >
              X
            </button>
          )}
        </div>

        <div className="flex gap-3 items-center max-sm:justify-between">
          {selectedImages.length > 0 && (
            <div className="flex items-center gap-3 py-2 px-4 bg-primary/10 border border-primary/30 rounded-lg text-[0.813rem] text-primary">
              <span>{selectedImages.length} selected</span>
              <button
                className="py-1.5 px-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-xs font-medium cursor-pointer transition-all duration-200 hover:bg-destructive/20"
                onClick={handleBulkDelete}
              >
                Delete Selected
              </button>
            </div>
          )}

          <select
            className="py-2 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground text-[0.813rem] cursor-pointer transition-all duration-200 focus:outline-none focus:border-primary max-sm:text-xs max-sm:py-1.5 max-sm:px-2"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
          >
            <option value="name">Sort by Name</option>
            <option value="date">Sort by Date (Newest First)</option>
            <option value="size">Sort by Size</option>
          </select>

        </div>
      </div>

      {/* Select All Checkbox */}
      {currentImages.length > 0 && (
        <div className="flex items-center gap-2 mb-4 py-3 px-4 bg-foreground/[0.03] rounded-lg border border-foreground/5 mx-2">
          <input
            type="checkbox"
            id="selectAll"
            checked={allDisplayedSelected}
            onChange={handleSelectAll}
            className="w-[18px] h-[18px] accent-primary cursor-pointer"
          />
          <label htmlFor="selectAll" className="cursor-pointer text-sm text-foreground/80">
            Select All on Page ({currentImages.length})
          </label>
        </div>
      )}

      {/* Content Area */}
      <div className="min-h-[400px]">
        {loading ? (
          <ProgressLoader
            isVisible={true}
            message="Loading images..."
            progress={50}
          />
        ) : processedImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-foreground/60">
            <div className="text-6xl opacity-30 mb-4">Images</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No images found</h3>
            <p className="mt-4 text-sm">
              {searchQuery
                ? `No images match "${searchQuery}"`
                : brandId
                  ? `No images for ${brands.find(b => b.id === brandId)?.brand_name}`
                  : 'Upload your first image to get started'
              }
            </p>
            {searchQuery && (
              <button
                className="mt-4 py-2 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground/70 text-[0.813rem] cursor-pointer transition-all duration-200 hover:bg-foreground/[0.08] hover:border-primary hover:text-primary"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6 mb-8 px-2">
              {currentImages.map(image => (
                <ImageCard
                  key={image.id}
                  image={image}
                  isSelected={selectedImages.includes(image.id)}
                  onSelect={() => handleSelectImage(image.id)}
                  onDelete={() => handleDeleteImage(image.id)}
                  brandColor="var(--primary)"
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="py-2 px-4 bg-foreground/5 border border-foreground/10 rounded-md text-foreground/70 cursor-pointer transition-all duration-200 text-sm hover:bg-foreground/[0.08] hover:text-foreground hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-foreground/80 text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="py-2 px-4 bg-foreground/5 border border-foreground/10 rounded-md text-foreground/70 cursor-pointer transition-all duration-200 text-sm hover:bg-foreground/[0.08] hover:text-foreground hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <ImageUploadModal
          brands={brandId ? brands.filter(b => b.id === brandId) : brands}
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={handleUploadSuccess}
          defaultBrand={brandId}
        />
      )}

      {/* AI Batch Upload Modal */}
      {showBatchUpload && agentId && (
        <BatchImageUpload
          companyId={agentId}
          onClose={() => setShowBatchUpload(false)}
          onComplete={async () => {
            setShowBatchUpload(false);
            await handleRefresh();
          }}
        />
      )}
    </div>
  );
};

export default ImageManagement;
