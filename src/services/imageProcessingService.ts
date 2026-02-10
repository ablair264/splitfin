/**
 * AI-Powered Image Processing Service
 * Handles SKU matching, WebP conversion, and upload to backend
 * AI analysis (product type, color detection) happens server-side during upload
 *
 * SKU Matching Strategy:
 * 1. Extract tokens from filename (split on _ - . space)
 * 2. Build combined tokens from adjacent pairs (e.g. "ABC" + "123" -> "ABC123")
 * 3. Normalize everything (strip non-alphanumeric, uppercase)
 * 4. Match tokens against a normalised SKU index
 * 5. Longest match wins (avoids false positives on short tokens)
 * 6. Falls back to uploading without a match (never rejects an image)
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

/** Strip everything except letters and digits, then uppercase */
function normalise(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** True when a string is all digits — numeric SKUs are precise identifiers */
function isNumeric(s: string): boolean {
  return /^\d+$/.test(s);
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
  /** all products for substring search */
  all: { norm: string; product: ProductInfo }[];
}

function buildSkuIndex(products: ProductInfo[]): SkuIndex {
  const exact = new Map<string, ProductInfo>();
  const all: { norm: string; product: ProductInfo }[] = [];

  for (const p of products) {
    if (!p.sku) continue;
    const norm = normalise(p.sku);
    if (norm.length === 0) continue;
    exact.set(norm, p);
    all.push({ norm, product: p });
  }

  return { exact, all };
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

      return allProducts;
    } catch (error) {
      console.error('Error fetching product SKUs:', error);
      return [];
    }
  }

  /**
   * Smart SKU matching: extract tokens from filename, match against normalised SKU index.
   *
   * Matching priority:
   *  1.0  — A token IS the normalised SKU (exact)
   *  0.95 — A token contains the normalised SKU as a substring
   *  0.90 — The normalised SKU contains a token as a substring (token >=4 chars)
   *  0.80 — Levenshtein on token vs SKU (edit distance <= 2 and token >=4 chars)
   *
   * Among ties, the longest matching SKU wins (avoids short false-positive matches).
   */
  matchSKUFromFilename(
    filename: string,
    availableSKUs: ProductInfo[],
  ): { sku: string; confidence: number; productInfo: ProductInfo } | null {
    if (availableSKUs.length === 0) return null;

    const index = buildSkuIndex(availableSKUs);
    const tokens = extractTokens(filename);

    let bestMatch: { sku: string; confidence: number; productInfo: ProductInfo } | null = null;

    for (const token of tokens) {
      if (token.length < 2) continue;

      // 1. Exact normalised match
      const exactProduct = index.exact.get(token);
      if (exactProduct) {
        const conf = 1.0;
        if (!bestMatch || conf > bestMatch.confidence || (conf === bestMatch.confidence && token.length > normalise(bestMatch.sku).length)) {
          bestMatch = { sku: exactProduct.sku, confidence: conf, productInfo: exactProduct };
        }
        continue; // can't do better than 1.0
      }

      // 2-4. Check against all SKUs
      for (const { norm: skuNorm, product } of index.all) {
        // Purely numeric pairs (e.g. "6302" vs "63042") are precise identifiers —
        // substring/fuzzy matching produces false positives. Only exact match allowed.
        const bothNumeric = isNumeric(token) && isNumeric(skuNorm);

        // 2. Token contains the SKU
        if (!bothNumeric && token.length > skuNorm.length && token.includes(skuNorm) && skuNorm.length >= 3) {
          const conf = 0.95;
          if (!bestMatch || conf > bestMatch.confidence || (conf === bestMatch.confidence && skuNorm.length > normalise(bestMatch.sku).length)) {
            bestMatch = { sku: product.sku, confidence: conf, productInfo: product };
          }
        }

        // 3. SKU contains the token (token must be substantial)
        if (!bothNumeric && skuNorm.length > token.length && skuNorm.includes(token) && token.length >= 4) {
          const conf = 0.90;
          if (!bestMatch || conf > bestMatch.confidence) {
            bestMatch = { sku: product.sku, confidence: conf, productInfo: product };
          }
        }

        // 4. Fuzzy: small edit distance (for typos / minor differences)
        // Same-length only to prevent insertion/deletion false positives
        if (!bothNumeric && token.length >= 4 && token.length === skuNorm.length) {
          const dist = this.levenshteinDistance(token, skuNorm);
          if (dist <= 2) {
            const conf = dist === 1 ? 0.85 : 0.80;
            if (!bestMatch || conf > bestMatch.confidence) {
              bestMatch = { sku: product.sku, confidence: conf, productInfo: product };
            }
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Levenshtein edit distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[m][n];
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
   * 1. SKU match from filename (smart token extraction)
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
  ): Promise<ImageProcessingResult> {
    try {
      const originalFilename = file.name;

      // Step 1: Match SKU from filename
      const skuMatch = this.matchSKUFromFilename(originalFilename, availableSKUs);

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
        productType: uploaded.ai_product_type || undefined,
        detectedColor: uploaded.ai_color || undefined,
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
}

export const imageProcessingService = new ImageProcessingService();
