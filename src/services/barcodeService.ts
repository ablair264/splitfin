import { productService } from './productService';

export interface Product {
  id: string;
  name: string;
  sku: string;
  gross_stock_level: number;
  net_stock_level: number;
  retail_price: number;
  cost_price: number;
  purchase_price: number;
  brand_id: string;
  manufacturer?: string;
  image_url?: string;
  category?: string;
  colour?: string;
  description?: string;
  ean?: string;
  status: 'active' | 'inactive';
  created_date?: string;
  updated_at?: string;
  height?: number;
  width?: number;
  length?: number;
  diameter?: number;
  packing_unit?: number;
  catalogue_page_number?: number;
  brand?: {
    id: string;
    brand_name: string;
    brand_normalized: string;
    logo_url?: string;
    company_id: string;
    is_active: boolean;
  };
  [key: string]: any;
}

export class BarcodeService {
  /**
   * Search for product by barcode (EAN, SKU, or other identifier)
   */
  static async findProductByBarcode(barcode: string): Promise<Product | null> {
    try {
      // Clean the barcode (remove any whitespace, ensure it's a string)
      const cleanBarcode = String(barcode).trim();

      // Search by EAN or SKU using the product service search
      const result = await productService.list({ search: cleanBarcode, limit: 5 });

      if (result.data && result.data.length > 0) {
        // Try to find exact EAN or SKU match first
        const exactMatch = result.data.find(
          p => p.ean === cleanBarcode || p.sku === cleanBarcode
        );

        if (exactMatch) {
          return BarcodeService.mapToLegacyProduct(exactMatch);
        }

        // Fall back to first result if no exact match
        return BarcodeService.mapToLegacyProduct(result.data[0]);
      }

      return null;
    } catch (error) {
      console.error('Error in findProductByBarcode:', error);
      return null;
    }
  }

  /**
   * Get multiple products by barcodes (for batch scanning)
   */
  static async findProductsByBarcodes(barcodes: string[]): Promise<Product[]> {
    try {
      const products: Product[] = [];

      // Search for each barcode individually since the API doesn't support batch EAN lookup
      for (const barcode of barcodes) {
        const product = await BarcodeService.findProductByBarcode(barcode);
        if (product) {
          products.push(product);
        }
      }

      return products;
    } catch (error) {
      console.error('Error in findProductsByBarcodes:', error);
      return [];
    }
  }

  /**
   * Log barcode scan events (for analytics/debugging)
   */
  static async logScanEvent(barcode: string, found: boolean, productId?: string) {
    // TODO: Implement scan logging when scan_logs table/endpoint is available
    console.log('Scan event:', { barcode, found, productId });
  }

  /**
   * Map a Product from the new domain type to the legacy Product interface
   */
  private static mapToLegacyProduct(p: any): Product {
    return {
      id: String(p.id),
      name: p.name || '',
      sku: p.sku || '',
      gross_stock_level: p.stock_on_hand || 0,
      net_stock_level: p.stock_on_hand || 0,
      retail_price: null,
      cost_price: p.cost_price || 0,
      purchase_price: p.cost_price || 0,
      brand_id: '',
      manufacturer: p.manufacturer || '',
      image_url: p.image_url || undefined,
      category: p.category_name || undefined,
      colour: p.color_family || undefined,
      description: p.description || undefined,
      ean: p.ean || undefined,
      status: p.status || 'active',
      brand: {
        id: '',
        brand_name: p.brand || '',
        brand_normalized: (p.brand || '').toLowerCase(),
        company_id: '',
        is_active: true
      }
    };
  }
}
