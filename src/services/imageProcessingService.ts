/**
 * AI-Powered Image Processing Service
 * Handles SKU matching, WebP conversion, and upload to backend
 * AI analysis (product type, color detection) happens server-side during upload
 */

import { productService } from './productService';
import { imageService } from './imageService';

export interface ImageProcessingResult {
  success: boolean;
  originalFilename: string;
  finalFilename: string;
  matchedSku?: string;
  productType?: string;
  detectedColor?: string;
  confidence?: number;
  webpUrl?: string;
  error?: string;
}

export interface BatchUploadProgress {
  total: number;
  processed: number;
  current: string;
  results: ImageProcessingResult[];
  errors: string[];
}

export interface ProductInfo {
  sku: string;
  name: string;
  brand_name: string;
}

class ImageProcessingService {
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.canvas = document.createElement('canvas');
    }
  }

  /**
   * Get all SKUs for a specific brand for matching
   */
  async getProductSKUs(brandId?: string): Promise<ProductInfo[]> {
    try {
      const filters: Record<string, string | number> = { status: 'active' };
      if (brandId) {
        filters.brand = brandId;
      }

      const result = await productService.list(filters);

      return result.data?.map((item: any) => ({
        sku: item.sku,
        name: item.name,
        brand_name: item.brand || 'Unknown'
      })) || [];
    } catch (error) {
      console.error('Error fetching product SKUs:', error);
      return [];
    }
  }

  /**
   * Advanced SKU matching algorithm
   */
  matchSKUFromFilename(filename: string, availableSKUs: ProductInfo[]): {
    sku: string;
    confidence: number;
    productInfo: ProductInfo;
  } | null {
    const cleanFilename = filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[_\-\s]+/g, ' ')
      .toUpperCase();

    let bestMatch: { sku: string; confidence: number; productInfo: ProductInfo } | null = null;

    for (const product of availableSKUs) {
      const sku = product.sku.toUpperCase();
      const confidence = this.calculateSKUMatchConfidence(cleanFilename, sku);

      if (confidence > 0.7 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = {
          sku: product.sku,
          confidence,
          productInfo: product
        };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate confidence score for SKU matching
   */
  private calculateSKUMatchConfidence(filename: string, sku: string): number {
    if (filename.includes(sku)) return 1.0;
    if (filename.startsWith(sku)) return 0.95;
    if (filename.endsWith(sku)) return 0.9;

    const skuVariations = [
      sku,
      sku.replace(/[^a-zA-Z0-9]/g, ''),
      sku.replace(/[^a-zA-Z0-9]/g, '').split('').join('[-_\\s]*'),
    ];

    for (const variation of skuVariations) {
      try {
        const regex = new RegExp(variation, 'i');
        if (regex.test(filename)) return 0.8;
      } catch {
        // Skip invalid regex
      }
    }

    const similarity = this.calculateStringSimilarity(filename, sku);
    if (similarity > 0.8) return 0.75;

    return 0;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : (maxLen - matrix[len1][len2]) / maxLen;
  }

  /**
   * Convert image to WebP format
   */
  async convertToWebP(file: File, quality: number = 0.90): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.canvas) {
        reject(new Error('Canvas not available'));
        return;
      }

      const img = new Image();
      const ctx = this.canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        this.canvas!.width = img.width;
        this.canvas!.height = img.height;
        ctx.drawImage(img, 0, 0);

        this.canvas!.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert to WebP'));
            }
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Generate final filename with duplicate handling
   */
  generateFinalFilename(sku: string, existingFilenames: string[], extension: string = 'webp'): string {
    const baseName = sku.toLowerCase();
    let finalName = `${baseName}.${extension}`;
    let counter = 1;

    while (existingFilenames.includes(finalName)) {
      finalName = `${baseName}_${counter}.${extension}`;
      counter++;
    }

    return finalName;
  }

  /**
   * Process a single image through the pipeline:
   * 1. SKU match from filename
   * 2. WebP conversion (0.90 quality)
   * 3. Upload to backend (R2 storage + AI analysis)
   */
  async processImage(
    file: File,
    availableSKUs: ProductInfo[],
    existingFilenames: string[],
    brandName: string
  ): Promise<ImageProcessingResult> {
    try {
      const originalFilename = file.name;

      // Step 1: Match SKU from filename
      const skuMatch = this.matchSKUFromFilename(originalFilename, availableSKUs);

      if (!skuMatch) {
        return {
          success: false,
          originalFilename,
          finalFilename: '',
          error: 'No matching SKU found in filename'
        };
      }

      // Step 2: Convert to WebP (0.90 quality for website display)
      const webpBlob = await this.convertToWebP(file, 0.90);

      // Step 3: Upload to backend (handles R2 storage + AI analysis)
      const uploaded = await imageService.upload(webpBlob, brandName, {
        matched_sku: skuMatch.sku,
        sku_confidence: skuMatch.confidence,
        original_filename: originalFilename,
        width: undefined, // canvas dimensions captured server-side
        height: undefined,
      });

      // Track filename to prevent duplicates in batch
      existingFilenames.push(uploaded.filename);

      return {
        success: true,
        originalFilename,
        finalFilename: uploaded.filename,
        matchedSku: skuMatch.sku,
        productType: uploaded.ai_product_type || undefined,
        detectedColor: uploaded.ai_color || undefined,
        confidence: skuMatch.confidence,
        webpUrl: uploaded.url,
      };
    } catch (error) {
      return {
        success: false,
        originalFilename: file.name,
        finalFilename: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process multiple images in batch
   */
  async processBatchImages(
    files: FileList | File[],
    brandName: string,
    onProgress?: (progress: BatchUploadProgress) => void
  ): Promise<BatchUploadProgress> {
    const fileArray = Array.from(files);
    const results: ImageProcessingResult[] = [];
    const errors: string[] = [];
    const existingFilenames: string[] = [];

    // Get available SKUs for the brand
    const availableSKUs = await this.getProductSKUs(brandName);

    const progress: BatchUploadProgress = {
      total: fileArray.length,
      processed: 0,
      current: '',
      results,
      errors
    };

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      progress.current = file.name;
      progress.processed = i;

      if (onProgress) {
        onProgress({ ...progress });
      }

      try {
        const result = await this.processImage(
          file,
          availableSKUs,
          existingFilenames,
          brandName
        );

        results.push(result);

        if (!result.success && result.error) {
          errors.push(`${file.name}: ${result.error}`);
        }

        // Small delay between uploads to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        const errorMessage = `${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        results.push({
          success: false,
          originalFilename: file.name,
          finalFilename: '',
          error: errorMessage
        });
      }
    }

    progress.processed = fileArray.length;
    progress.current = '';

    if (onProgress) {
      onProgress({ ...progress });
    }

    return progress;
  }
}

export const imageProcessingService = new ImageProcessingService();
