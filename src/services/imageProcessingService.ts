/**
 * AI-Powered Image Processing Service
 * Handles SKU matching, WebP conversion, and upload to backend
 * AI analysis (product type, color detection) happens server-side during upload
 *
 * SKU Matching Strategy:
 * 1. Fetch brand SKU pattern (regex) from brand_sku_patterns table
 * 2. Extract tokens from filename (split on _ - . space)
 * 3. If brand has a pattern, filter tokens to those matching the pattern
 * 4. EXACT match only against normalised SKU index — no fuzzy matching
 * 5. Falls back to uploading without a match (never rejects an image)
 */

import { productService } from './productService';
import { imageService } from './imageService';

export interface ImageProcessingResult {
  success: boolean;
  originalFilename: string;
  finalFilename: string;
  matchedSku?: string;
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

/** Strip everything except letters and digits, then uppercase */
function normalise(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Extract candidate tokens from a filename.
 *
 * Given "BRAND_ABC-123_Blue_Front.jpg" produces:
 *   singles:  ["BRAND", "ABC", "123", "BLUE", "FRONT"]
 *   pairs:    ["BRANDABC", "ABC123", "123BLUE", "BLUEFRONT"]
 *   triples:  ["BRANDABC123", "ABC123BLUE", "123BLUEFRONT"]
 *
 * All values are normalised (uppercase, alphanumeric only).
 */
function extractTokens(filename: string): string[] {
  // Strip file extension
  const base = filename.replace(/\.[^/.]+$/, '');

  // Split on common delimiters
  const raw = base.split(/[_\-\.\s]+/).filter(Boolean);
  const singles = raw.map(normalise).filter(t => t.length > 0);

  const tokens = new Set(singles);

  // Combined adjacent pairs
  for (let i = 0; i < singles.length - 1; i++) {
    tokens.add(singles[i] + singles[i + 1]);
  }
  // Combined adjacent triples
  for (let i = 0; i < singles.length - 2; i++) {
    tokens.add(singles[i] + singles[i + 1] + singles[i + 2]);
  }

  // Also add the full normalised basename (handles filenames that ARE the SKU)
  tokens.add(normalise(base));

  return Array.from(tokens);
}

interface SkuIndex {
  /** normalised SKU string -> original ProductInfo */
  exact: Map<string, ProductInfo>;
}

function buildSkuIndex(products: ProductInfo[]): SkuIndex {
  const exact = new Map<string, ProductInfo>();

  for (const p of products) {
    if (!p.sku) continue;
    const norm = normalise(p.sku);
    if (norm.length === 0) continue;
    exact.set(norm, p);
  }

  return { exact };
}

/** Cache of brand SKU patterns (fetched once per session) */
let patternCache: Map<string, RegExp> | null = null;

async function getBrandPatterns(): Promise<Map<string, RegExp>> {
  if (patternCache) return patternCache;

  try {
    const patterns = await imageService.getSkuPatterns();
    patternCache = new Map();
    for (const p of patterns) {
      try {
        // Wrap pattern with ^ and $ for full-match, case-insensitive
        patternCache.set(p.brand_name, new RegExp(`^${p.pattern}$`, 'i'));
      } catch {
        console.warn(`Invalid SKU pattern for brand "${p.brand_name}":`, p.pattern);
      }
    }
    return patternCache;
  } catch {
    console.warn('Failed to fetch brand SKU patterns, using exact-only matching');
    return new Map();
  }
}

class ImageProcessingService {
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.canvas = document.createElement('canvas');
    }
  }

  /**
   * Fetch ALL SKUs for a brand, paginating through the full set.
   * The old code used default pagination (limit ~50), missing most products.
   */
  async getProductSKUs(brandName?: string): Promise<ProductInfo[]> {
    try {
      const allProducts: ProductInfo[] = [];
      const pageSize = 200;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const filters: Record<string, string | number> = {
          status: 'active',
          limit: pageSize,
          offset,
        };
        if (brandName) {
          filters.brand = brandName;
        }

        const result = await productService.list(filters);
        const items = result.data || [];

        for (const item of items) {
          if (item.sku) {
            allProducts.push({
              sku: item.sku,
              name: item.name,
              brand_name: (item as any).brand || 'Unknown',
            });
          }
        }

        hasMore = result.meta?.has_more ?? items.length === pageSize;
        offset += pageSize;
      }

      if (brandName && allProducts.length === 0) {
        // Fallback: brand filter may not match stored brand casing/spaces.
        return this.getProductSKUs();
      }

      return allProducts;
    } catch (error) {
      console.error('Error fetching product SKUs:', error);
      return [];
    }
  }

  async getBrandPattern(brandName?: string): Promise<RegExp | undefined> {
    if (!brandName) return undefined;
    const patterns = await getBrandPatterns();
    return patterns.get(brandName);
  }

  /**
   * Smart SKU matching: extract tokens from filename, match against normalised SKU index.
   *
   * If the brand has a SKU pattern defined, only tokens matching that pattern are
   * considered as candidates. This eliminates false positives entirely.
   *
   * ALL matching is exact only — no fuzzy/Levenshtein/substring matching.
   * A token either IS the SKU or it isn't.
   */
  matchSKUFromFilename(
    filename: string,
    availableSKUs: ProductInfo[],
    brandPattern?: RegExp,
    brandName?: string,
  ): { sku: string; confidence: number; productInfo: ProductInfo } | null {
    if (availableSKUs.length === 0) return null;

    const index = buildSkuIndex(availableSKUs);
    const tokens = extractTokens(filename);

    let bestMatch: { sku: string; confidence: number; productInfo: ProductInfo } | null = null;

    const tryMatch = (pattern?: RegExp) => {
      for (const token of tokens) {
        if (token.length < 2) continue;
        if (pattern && !pattern.test(token)) continue;
        const exactProduct = index.exact.get(token);
        if (exactProduct) {
          const conf = 1.0;
          if (!bestMatch || token.length > normalise(bestMatch.sku).length) {
            bestMatch = { sku: exactProduct.sku, confidence: conf, productInfo: exactProduct };
          }
        }
      }
    };

    tryMatch(brandPattern);
    if (!bestMatch && brandPattern) {
      // Fallback to patternless match if pattern is too strict.
      tryMatch();
    }

    if (!bestMatch && brandName?.toLowerCase() === 'rader') {
      // Numeric SKU fallback (e.g. filenames like _MG_5514.jpg -> SKU "5514")
      const digitTokens = filename.match(/\d{3,}/g) || [];
      if (digitTokens.length > 0) {
        const exactNumericIndex = new Map<string, ProductInfo>();
        for (const p of availableSKUs) {
          const rawSku = (p.sku || '').trim();
          if (!rawSku) continue;
          if (/^\d+$/.test(rawSku)) {
            exactNumericIndex.set(rawSku.replace(/^0+/, '') || '0', p);
          }
        }

        for (const token of digitTokens) {
          const key = token.replace(/^0+/, '') || '0';
          const match = exactNumericIndex.get(key);
          if (match) {
            bestMatch = { sku: match.sku, confidence: 0.95, productInfo: match };
            break;
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Convert image to WebP format using canvas.
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
          quality,
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Generate final filename with duplicate handling.
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
   * 1. SKU match from filename (pattern extraction + exact match)
   * 2. WebP conversion (0.90 quality)
   * 3. Upload to backend (R2 storage + AI analysis)
   *
   * If no SKU match is found, the image is still uploaded (unmatched) instead of rejected.
   */
  async processImage(
    file: File,
    availableSKUs: ProductInfo[],
    existingFilenames: string[],
    brandName: string,
    brandPattern?: RegExp,
  ): Promise<ImageProcessingResult> {
    try {
      const originalFilename = file.name;

      // Step 1: Match SKU from filename (exact only, pattern-filtered)
      const skuMatch = this.matchSKUFromFilename(originalFilename, availableSKUs, brandPattern, brandName);

      // Step 2: Convert to WebP (0.90 quality for website display)
      const webpBlob = await this.convertToWebP(file, 0.90);

      // Step 3: Upload to backend (handles R2 storage + AI analysis)
      const uploaded = await imageService.upload(webpBlob, brandName, {
        matched_sku: skuMatch?.sku,
        sku_confidence: skuMatch?.confidence,
        original_filename: originalFilename,
      });

      // Track filename to prevent duplicates in batch
      existingFilenames.push(uploaded.filename);

      return {
        success: true,
        originalFilename,
        finalFilename: uploaded.filename,
        matchedSku: skuMatch?.sku,
        confidence: skuMatch?.confidence,
        webpUrl: uploaded.url,
      };
    } catch (error) {
      return {
        success: false,
        originalFilename: file.name,
        finalFilename: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process multiple images in batch.
   */
  async processBatchImages(
    files: FileList | File[],
    brandName: string,
    onProgress?: (progress: BatchUploadProgress) => void,
  ): Promise<BatchUploadProgress> {
    const fileArray = Array.from(files);
    const results: ImageProcessingResult[] = [];
    const errors: string[] = [];
    const existingFilenames: string[] = [];

    // Get ALL available SKUs for the brand (paginated fetch)
    const availableSKUs = await this.getProductSKUs(brandName);

    // Get brand SKU pattern (if defined)
    const patterns = await getBrandPatterns();
    const brandPattern = patterns.get(brandName);

    const progress: BatchUploadProgress = {
      total: fileArray.length,
      processed: 0,
      current: '',
      results,
      errors,
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
          brandName,
          brandPattern,
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
          error: errorMessage,
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

  /** Clear the cached patterns (e.g. after editing patterns in settings) */
  clearPatternCache() {
    patternCache = null;
  }
}

export const imageProcessingService = new ImageProcessingService();
