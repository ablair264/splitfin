/**
 * AI-Powered Image Processing Service
 * Handles SKU matching, WebP conversion, and AI analysis
 */

import { productService } from './productService';

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
  itemDetails?: {
    sku: string;
    name: string;
    brand_name: string;
    image_url: string | null;
    brand_logo_url: string | null;
    colour: string | null;
    category: string | null;
  };
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
    // Create a canvas for image processing
    if (typeof window !== 'undefined') {
      this.canvas = document.createElement('canvas');
    }
  }

  /**
   * Get all SKUs for a specific brand/company for matching
   */
  async getProductSKUs(_companyId: string, brandId?: string): Promise<ProductInfo[]> {
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
    // Remove file extension and clean filename
    const cleanFilename = filename
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[_\-\s]+/g, ' ') // Replace separators with spaces
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
    // Exact match
    if (filename.includes(sku)) {
      return 1.0;
    }

    // Check if filename starts with SKU
    if (filename.startsWith(sku)) {
      return 0.95;
    }

    // Check if SKU is at the end
    if (filename.endsWith(sku)) {
      return 0.9;
    }

    // Partial matching with different separators
    const skuVariations = [
      sku,
      sku.replace(/[^a-zA-Z0-9]/g, ''), // Remove special chars
      sku.replace(/[^a-zA-Z0-9]/g, '').split('').join('[-_\\s]*'), // Flexible spacing
    ];

    for (const variation of skuVariations) {
      try {
        const regex = new RegExp(variation, 'i');
        if (regex.test(filename)) {
          return 0.8;
        }
      } catch (e) {
        // Skip invalid regex
      }
    }

    // Fuzzy matching for similar patterns
    const similarity = this.calculateStringSimilarity(filename, sku);
    if (similarity > 0.8) {
      return 0.75;
    }

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
  async convertToWebP(file: File, quality: number = 0.8): Promise<Blob> {
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
        // Set canvas size to image dimensions
        this.canvas!.width = img.width;
        this.canvas!.height = img.height;

        // Draw image to canvas
        ctx.drawImage(img, 0, 0);

        // Convert to WebP
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
   * Analyze image for product type and color using OpenAI Vision API
   */
  async analyzeImageWithAI(imageFile: File): Promise<{
    productType: string;
    color: string;
    confidence: number;
    additionalInfo: string[];
  }> {
    try {
      // Check if OpenAI is available
      const openai = this.initializeOpenAI();
      if (!openai) {
        // Fallback to basic analysis
        return this.analyzeImageBasic(imageFile);
      }

      // Convert image to base64 for OpenAI
      const base64Image = await this.convertFileToBase64(imageFile);

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this product image and provide:\n1. The main product type/category (be specific, e.g., 'Decorative Candle', 'Throw Pillow', 'Wall Art', etc.)\n2. The primary color (use common color names like 'Red', 'Blue', 'Green', 'Beige', etc.)\n3. Any additional descriptive details about the product\n\nRespond in JSON format: {\"productType\": \"...\", \"color\": \"...\", \"confidence\": 0.0-1.0, \"details\": \"...\"}"
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageFile.type};base64,${base64Image}`,
                  detail: "low"
                }
              }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.1
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      const analysis = JSON.parse(content);

      return {
        productType: analysis.productType || 'Unknown',
        color: analysis.color || 'Unknown',
        confidence: Math.min(analysis.confidence || 0.8, 1.0),
        additionalInfo: [
          analysis.details || 'AI analysis completed',
          `Image size: ${imageFile.size} bytes`,
          `File type: ${imageFile.type}`
        ]
      };

    } catch (error) {
      console.error('OpenAI analysis failed, falling back to basic analysis:', error);
      return this.analyzeImageBasic(imageFile);
    }
  }

  /**
   * Fallback basic image analysis using canvas
   */
  private async analyzeImageBasic(imageFile: File): Promise<{
    productType: string;
    color: string;
    confidence: number;
    additionalInfo: string[];
  }> {
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        if (!this.canvas) {
          resolve({
            productType: 'Unknown',
            color: 'Unknown',
            confidence: 0.1,
            additionalInfo: ['Canvas not available']
          });
          return;
        }

        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
          resolve({
            productType: 'Unknown',
            color: 'Unknown',
            confidence: 0.1,
            additionalInfo: ['Context not available']
          });
          return;
        }

        // Analyze image dimensions and content
        this.canvas.width = Math.min(img.width, 300);
        this.canvas.height = Math.min(img.height, 300);
        ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);

        // Get dominant color
        const dominantColor = this.extractDominantColor(ctx);

        // Analyze product type based on image characteristics
        const productType = this.analyzeProductType(ctx, img.width, img.height);

        resolve({
          productType: productType.type,
          color: dominantColor.name,
          confidence: Math.max(productType.confidence, dominantColor.confidence),
          additionalInfo: [
            `Dimensions: ${img.width}x${img.height}`,
            `Aspect ratio: ${(img.width / img.height).toFixed(2)}`,
            `Dominant RGB: ${dominantColor.rgb}`,
            'Basic analysis (OpenAI unavailable)'
          ]
        });
      };

      img.onerror = () => {
        resolve({
          productType: 'Unknown',
          color: 'Unknown',
          confidence: 0.1,
          additionalInfo: ['Failed to load image']
        });
      };

      img.src = URL.createObjectURL(imageFile);
    });
  }

  /**
   * Initialize OpenAI client
   */
  private initializeOpenAI() {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('OpenAI API key not found. Using fallback analysis.');
      return null;
    }

    // Dynamic import to avoid issues if OpenAI is not available
    try {
      const OpenAI = require('openai');
      return new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });
    } catch (error) {
      console.warn('OpenAI package not available:', error);
      return null;
    }
  }

  /**
   * Convert file to base64 for OpenAI
   */
  private async convertFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Extract dominant color from image
   */
  private extractDominantColor(ctx: CanvasRenderingContext2D): {
    name: string;
    rgb: string;
    confidence: number;
  } {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;

    // Sample pixels and calculate average color
    let r = 0, g = 0, b = 0;
    let pixelCount = 0;

    // Sample every 10th pixel for performance
    for (let i = 0; i < data.length; i += 40) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      pixelCount++;
    }

    r = Math.round(r / pixelCount);
    g = Math.round(g / pixelCount);
    b = Math.round(b / pixelCount);

    const colorName = this.rgbToColorName(r, g, b);

    return {
      name: colorName,
      rgb: `rgb(${r}, ${g}, ${b})`,
      confidence: 0.7
    };
  }

  /**
   * Convert RGB to human-readable color name
   */
  private rgbToColorName(r: number, g: number, b: number): string {
    // Calculate color properties
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (max + min) / 2;

    // Basic color detection
    if (brightness < 50) return 'Black';
    if (brightness > 200) return 'White';
    if (max - min < 30) return brightness > 150 ? 'Light Gray' : 'Gray';

    // Determine dominant color channel
    if (r > g && r > b) {
      if (g > b) return r > 180 ? 'Pink' : 'Red';
      return 'Red';
    } else if (g > r && g > b) {
      return g > 180 ? 'Light Green' : 'Green';
    } else if (b > r && b > g) {
      return b > 180 ? 'Light Blue' : 'Blue';
    } else if (r > 150 && g > 150) {
      return 'Yellow';
    } else if (r > 100 && b > 100) {
      return 'Purple';
    } else if (g > 100 && b > 100) {
      return 'Cyan';
    }

    return 'Mixed Color';
  }

  /**
   * Analyze product type based on image characteristics
   */
  private analyzeProductType(_ctx: CanvasRenderingContext2D, width: number, height: number): {
    type: string;
    confidence: number;
  } {
    const aspectRatio = width / height;
    const area = width * height;

    // Analyze image characteristics
    if (aspectRatio > 1.5 && aspectRatio < 2.0) {
      return { type: 'Textile/Throw', confidence: 0.7 };
    } else if (aspectRatio > 0.8 && aspectRatio < 1.2) {
      if (area > 500000) {
        return { type: 'Large Decor Item', confidence: 0.6 };
      } else {
        return { type: 'Small Decor Item', confidence: 0.6 };
      }
    } else if (aspectRatio > 0.3 && aspectRatio < 0.7) {
      return { type: 'Tall Item/Candle', confidence: 0.7 };
    } else if (aspectRatio > 2.0) {
      return { type: 'Wide Item/Textile', confidence: 0.6 };
    }

    return { type: 'General Product', confidence: 0.4 };
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
   * Upload image to storage
   * TODO: No direct file storage in the new architecture - needs backend upload endpoint
   */
  async uploadToStorage(
    _blob: Blob,
    _filename: string,
    _brandName: string,
    _companyId: string
  ): Promise<{ url: string; path: string }> {
    // TODO: Implement file upload via backend API endpoint
    throw new Error('File upload not yet implemented in new architecture. Needs backend upload endpoint.');
  }

  /**
   * Search for items by SKUs and return them with logo URLs
   */
  async searchItemsWithLogos(skus: string[], _companyId: string): Promise<Array<{
    sku: string;
    name: string;
    brand_name: string;
    image_url: string | null;
    brand_logo_url: string | null;
    colour: string | null;
    category: string | null;
  }>> {
    try {
      const results: Array<{
        sku: string;
        name: string;
        brand_name: string;
        image_url: string | null;
        brand_logo_url: string | null;
        colour: string | null;
        category: string | null;
      }> = [];

      for (const sku of skus) {
        const searchResult = await productService.list({ search: sku, limit: 1 });
        const item = searchResult.data.find(p => p.sku === sku);
        if (item) {
          results.push({
            sku: item.sku,
            name: item.name,
            brand_name: item.brand || 'Unknown',
            image_url: item.image_url,
            brand_logo_url: null, // TODO: Brand logo URL not available from productService
            colour: item.color_family,
            category: item.category_name
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error in searchItemsWithLogos:', error);
      return [];
    }
  }

  /**
   * Process a single image through the complete pipeline
   */
  async processImage(
    file: File,
    availableSKUs: ProductInfo[],
    existingFilenames: string[],
    brandName: string,
    companyId: string
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

      // Step 2: Generate final filename with duplicate handling
      const finalFilename = this.generateFinalFilename(
        skuMatch.sku,
        existingFilenames,
        'webp'
      );

      // Step 3: Convert to WebP
      await this.convertToWebP(file);

      // Step 4: AI analysis
      const aiAnalysis = await this.analyzeImageWithAI(file);

      // Step 4.5: Save AI-detected color and category to database if available
      if (skuMatch.sku && (aiAnalysis.color !== 'Unknown' || aiAnalysis.productType !== 'Unknown')) {
        try {
          // Find the product by SKU to get its ID
          const searchResult = await productService.list({ search: skuMatch.sku, limit: 1 });
          const product = searchResult.data.find(p => p.sku === skuMatch.sku);

          if (product) {
            const updateData: Record<string, any> = {};
            if (aiAnalysis.color !== 'Unknown') {
              updateData.color_family = aiAnalysis.color;
            }
            if (aiAnalysis.productType !== 'Unknown') {
              updateData.category_name = aiAnalysis.productType;
            }

            await productService.update(product.id, updateData);
            console.log(`Updated item data for SKU ${skuMatch.sku}:`, updateData);
          }
        } catch (error) {
          console.error(`Error updating item data for SKU ${skuMatch.sku}:`, error);
        }
      }

      // Step 5: Upload to storage
      // TODO: File upload not yet implemented in new architecture
      let uploadUrl = '';
      try {
        // const uploadResult = await this.uploadToStorage(webpBlob, finalFilename, brandName, companyId);
        // uploadUrl = uploadResult.url;
        console.warn('File upload skipped - not yet implemented in new architecture');
      } catch (error) {
        console.warn('File upload not available:', error);
      }

      // Step 6: Search for item details including logo URL
      const itemsWithLogos = await this.searchItemsWithLogos([skuMatch.sku], companyId);
      const itemDetails = itemsWithLogos[0];

      // Update existing filenames list
      existingFilenames.push(finalFilename);

      return {
        success: true,
        originalFilename,
        finalFilename,
        matchedSku: skuMatch.sku,
        productType: aiAnalysis.productType,
        detectedColor: aiAnalysis.color,
        confidence: Math.min(skuMatch.confidence, aiAnalysis.confidence),
        webpUrl: uploadUrl || undefined,
        itemDetails: itemDetails || undefined
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
    companyId: string,
    brandId: string,
    onProgress?: (progress: BatchUploadProgress) => void
  ): Promise<BatchUploadProgress> {
    const fileArray = Array.from(files);
    const results: ImageProcessingResult[] = [];
    const errors: string[] = [];
    const existingFilenames: string[] = [];

    // Get available SKUs for the brand
    const availableSKUs = await this.getProductSKUs(companyId, brandId);
    const brandInfo = availableSKUs[0]?.brand_name || 'Unknown';

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
          brandInfo,
          companyId
        );

        results.push(result);

        if (!result.success && result.error) {
          errors.push(`${file.name}: ${result.error}`);
        }

        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));

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
