import * as XLSX from 'xlsx';
import { productService } from './productService';
import type { Product } from '../types/domain';

/**
 * Service to integrate Splitfin updates with the existing Pricelists export system
 * This bridges the gap between Splitfin's real-time updates and the batch export processes
 *
 * NOTE: Converted from Supabase to use productService (backend API pattern)
 * The old 'items' table with 'brands' relation is now the 'products' table with a 'brand' string field
 */

interface ExportItem {
  id?: number;
  sku: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  colour?: string;
  ean?: string;
  manufacturer?: string;
  packing_unit?: number;
  cost_price?: number;
  retail_price?: number;
  purchase_price?: number;
  rate?: number;
  weight?: number;
  height?: number;
  width?: number;
  length?: number;
  diameter?: number;
  volume?: number;
  gross_stock_level?: number;
  stock_on_hand?: number;
  reorder_level?: number;
  catalogue_page_number?: string;
  burning_hours?: string;
  scent?: string;
  dishwasher?: string;
  microwave?: string;
  image_url?: string;
  image_urls?: string[];
  status?: string;
  created_date?: string;
  created_at?: string;
  updated_at?: string;
}

class PricelistExportService {
  private pricelistsBasePath = '/Users/alastairblair/Development/Pricelists';

  /**
   * Export updated inventory data to formats compatible with existing Pricelists system
   */
  public exportToMasterDatasets = async (): Promise<void> => {
    try {
      console.log('Starting master dataset export...');

      // Get all active inventory items from backend API via productService
      const response = await productService.list({ status: 'active' });
      const items = response.data as ExportItem[];

      if (!items || items.length === 0) {
        console.log('No active items found for export');
        return;
      }

      // Group items by brand for export
      const itemsByBrand = this.groupItemsByBrand(items);

      // Export each brand to separate master files (compatible with existing system)
      await Promise.all(Object.entries(itemsByBrand).map(([brandName, brandItems]) =>
        this.exportBrandMasterFile(brandName, brandItems)
      ));

      // Create consolidated master file
      await this.createConsolidatedMaster(items);

      console.log('Master dataset export completed');
    } catch (error) {
      console.error('Error in exportToMasterDatasets:', error);
      throw error;
    }
  };

  /**
   * Group items by brand name for export
   */
  private groupItemsByBrand = (items: ExportItem[]): { [brandName: string]: ExportItem[] } => {
    return items.reduce((acc, item) => {
      // In the new schema, brand is a direct string field on products
      const brandName = item.brand || 'Unknown';
      if (!acc[brandName]) {
        acc[brandName] = [];
      }
      acc[brandName].push(item);
      return acc;
    }, {} as { [brandName: string]: ExportItem[] });
  };

  /**
   * Export individual brand master file (compatible with existing Pricelists system)
   */
  private exportBrandMasterFile = async (brandName: string, items: ExportItem[]): Promise<void> => {
    try {
      // Map Splitfin data to Pricelists system format
      const exportData = items.map(item => ({
        // Core product info
        sku: item.sku || '',
        name: item.name || '',
        description: item.description || item.name || '',
        brand_name: brandName,
        category: item.category || '',
        colour: item.colour || '',
        ean: item.ean || '',
        manufacturer: item.manufacturer || brandName,

        // Pricing (use rate as fallback for retail_price in new schema)
        cost_price: item.cost_price || 0,
        retail_price: item.retail_price || item.rate || 0,
        purchase_price: item.purchase_price || item.cost_price || 0,

        // Physical attributes
        weight: item.weight || 0,
        height: item.height || 0,
        width: item.width || 0,
        length: item.length || 0,
        diameter: item.diameter || 0,
        volume: item.volume || 0,

        // Inventory (use stock_on_hand from new schema)
        packing_unit: item.packing_unit || 1,
        gross_stock_level: item.gross_stock_level || item.stock_on_hand || 0,
        reorder_level: item.reorder_level || 0,

        // Additional
        catalogue_page_number: item.catalogue_page_number || '',
        burning_hours: item.burning_hours || '',
        scent: item.scent || '',
        dishwasher: item.dishwasher || '',
        microwave: item.microwave || '',

        // Metadata
        status: item.status || 'active',
        created_date: item.created_date || item.created_at,
        updated_at: item.updated_at || new Date().toISOString()
      }));

      // Create Excel file for compatibility
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, brandName);

      // Export path compatible with existing system
      const filename = `Master - ${brandName.replace(/[^a-zA-Z0-9]/g, '')}.xlsx`;

      // Generate and download the Excel file
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Auto-download the file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      console.log(`Exported ${items.length} items for ${brandName} to ${filename}`);

      // Store export data for tracking
      await this.storeExportData(brandName, exportData, 'brand_master');

    } catch (error) {
      console.error(`Error exporting brand file for ${brandName}:`, error);
      throw error;
    }
  };

  /**
   * Create consolidated master file (compatible with existing system)
   */
  private createConsolidatedMaster = async (items: ExportItem[]): Promise<void> => {
    try {
      // Map all items to consolidated format
      const consolidatedData = items.map(item => ({
        id: item.id || '',
        sku: item.sku || '',
        name: item.name || '',
        description: item.description || item.name || '',
        brand_name: item.brand || 'Unknown',
        category: item.category || '',
        colour: item.colour || '',
        ean: item.ean || '',
        manufacturer: item.manufacturer || item.brand || 'Unknown',
        packing_unit: item.packing_unit || 1,
        cost_price: item.cost_price || 0,
        retail_price: item.retail_price || item.rate || 0,
        purchase_price: item.purchase_price || item.cost_price || 0,
        weight: item.weight || 0,
        height: item.height || 0,
        width: item.width || 0,
        length: item.length || 0,
        volume: item.volume || 0,
        catalogue_page_number: item.catalogue_page_number || '',
        burning_hours: item.burning_hours || '',
        scent: item.scent || '',
        dishwasher: item.dishwasher || '',
        microwave: item.microwave || '',
        image_url: item.image_url || (item.image_urls && item.image_urls[0]) || '',
        status: item.status || 'active',
        created_date: item.created_date || item.created_at,
        updated_at: item.updated_at || new Date().toISOString()
      }));

      console.log(`Creating consolidated master with ${consolidatedData.length} total items`);

      // Create Excel workbook for consolidated data
      const worksheet = XLSX.utils.json_to_sheet(consolidatedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'All Products');

      // Generate and download the consolidated Excel file
      const filename = 'Master - Consolidated.xlsx';
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Auto-download the file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      console.log(`Exported consolidated master with ${consolidatedData.length} items`);

      // Store consolidated data
      await this.storeExportData('Consolidated', consolidatedData, 'master_consolidated');

    } catch (error) {
      console.error('Error creating consolidated master:', error);
      throw error;
    }
  };

  /**
   * Generate export files for external systems (Zoho, etc.)
   * NOTE: Shopify export removed as per project requirements - this is a standalone platform
   */
  public generateSystemExports = async (): Promise<{ [system: string]: unknown[] }> => {
    try {
      console.log('Generating system exports...');

      // Get consolidated data via productService
      const response = await productService.list({ status: 'active' });
      const items = response.data as ExportItem[];

      if (!items) {
        throw new Error('Failed to fetch items for export');
      }

      const exports = {
        zoho: this.formatForZoho(items),
        neon: this.formatForNeonProducts(items),
        bluealligator: this.formatForBlueAlligator(items)
      };

      // Store each export
      await Promise.all(Object.entries(exports).map(([system, data]) =>
        this.storeExportData(system, data, `export_${system}`)
      ));

      console.log('System exports completed');
      return exports;

    } catch (error) {
      console.error('Error generating system exports:', error);
      throw error;
    }
  };

  /**
   * Format data for Zoho Inventory import
   */
  private formatForZoho = (items: ExportItem[]): Record<string, unknown>[] => {
    return items.map(item => ({
      'Item Name': item.name || '',
      'SKU': item.sku || '',
      'Description': item.description || '',
      'Category': item.category || '',
      'Brand': item.brand || '',
      'Manufacturer': item.manufacturer || item.brand || '',
      'UPC': item.ean || '',
      'EAN': item.ean || '',
      'ISBN': '',
      'Part Number': item.sku || '',
      'Item Type': 'inventory',
      'Product Type': 'goods',
      'Stock on hand': item.gross_stock_level || item.stock_on_hand || 0,
      'Opening Stock Rate': item.cost_price || 0,
      'Reorder Level': item.reorder_level || 0,
      'Preferred Vendor': item.brand || '',
      'Purchase Rate': item.purchase_price || item.cost_price || 0,
      'Purchase Account': 'Cost of Goods Sold',
      'Purchase Description': item.description || '',
      'Sales Rate': item.retail_price || item.rate || 0,
      'Sales Account': 'Sales',
      'Sales Description': item.description || '',
      'Tax Preference': 'taxable',
      'Exemption Reason': '',
      'Purchase Tax': '',
      'Sales Tax': '',
      'Item Status': item.status === 'active' ? 'active' : 'inactive',
      'Source': 'user',
      'Is Returnable Item': 'true',
      'Weight': item.weight || 0,
      'Weight Unit': 'kg',
      'Dimensions (Length x Width x Height)': `${item.length || 0} x ${item.width || 0} x ${item.height || 0}`,
      'Dimension Unit': 'cm',
      'Created Time': item.created_date || item.created_at,
      'Last Modified Time': item.updated_at
    }));
  };

  /**
   * Format data for Neon products table (replaces formatForSupabaseItems)
   */
  private formatForNeonProducts = (items: ExportItem[]): Record<string, unknown>[] => {
    return items.map(item => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      brand: item.brand,
      category: item.category,
      colour: item.colour,
      ean: item.ean,
      manufacturer: item.manufacturer,
      packing_unit: item.packing_unit,
      cost_price: item.cost_price,
      retail_price: item.retail_price || item.rate,
      purchase_price: item.purchase_price,
      rate: item.rate,
      weight: item.weight,
      height: item.height,
      width: item.width,
      length: item.length,
      volume: item.volume,
      stock_on_hand: item.stock_on_hand || item.gross_stock_level,
      reorder_level: item.reorder_level,
      catalogue_page_number: item.catalogue_page_number,
      burning_hours: item.burning_hours,
      scent: item.scent,
      dishwasher: item.dishwasher,
      microwave: item.microwave,
      image_urls: item.image_urls,
      status: item.status,
      created_at: item.created_at || item.created_date,
      updated_at: item.updated_at
    }));
  };

  /**
   * Format data for BlueAlligator system
   */
  private formatForBlueAlligator = (items: ExportItem[]): Record<string, unknown>[] => {
    return items.map(item => ({
      'Product Code': item.sku || '',
      'Product Name': item.name || '',
      'Description': item.description || '',
      'Brand': item.brand || '',
      'Category': item.category || '',
      'Colour': item.colour || '',
      'Barcode': item.ean || '',
      'Supplier': item.manufacturer || item.brand || '',
      'Pack Size': item.packing_unit || 1,
      'Cost Price': item.cost_price || 0,
      'Retail Price': item.retail_price || item.rate || 0,
      'Weight (kg)': item.weight || 0,
      'Dimensions (cm)': `${item.length || 0}x${item.width || 0}x${item.height || 0}`,
      'Stock Level': item.gross_stock_level || item.stock_on_hand || 0,
      'Reorder Level': item.reorder_level || 0,
      'Status': item.status || 'active',
      'Date Added': item.created_date || item.created_at,
      'Last Updated': item.updated_at
    }));
  };

  /**
   * Store export data in localStorage for tracking
   * TODO: Could be extended to call a backend API endpoint for export logging
   */
  private storeExportData = async (system: string, data: unknown[], type: string): Promise<void> => {
    try {
      const exportRecord = {
        system,
        type,
        record_count: data.length,
        generated_at: new Date().toISOString(),
        status: 'ready'
      };

      console.log(`Export stored for ${system}:`, exportRecord);

      // Store in localStorage for tracking (replaces Supabase export_logs table)
      const exportLogs = JSON.parse(localStorage.getItem('export_logs') || '[]');
      exportLogs.push(exportRecord);
      // Keep only last 100 export logs
      if (exportLogs.length > 100) {
        exportLogs.splice(0, exportLogs.length - 100);
      }
      localStorage.setItem('export_logs', JSON.stringify(exportLogs));

    } catch (error) {
      console.error(`Error storing export data for ${system}:`, error);
    }
  };

  /**
   * Trigger the existing auto_process.py script (if needed)
   */
  public triggerLegacyExports = async (): Promise<void> => {
    try {
      console.log('Triggering legacy export processes...');

      // In a real implementation, you could:
      // 1. Call Python script via child process (server-side only)
      // 2. Queue a background job via backend API
      // 3. Send webhook to trigger external process

      // For now, just log what would happen
      console.log('Would execute: python3 /Users/alastairblair/Development/Pricelists/auto_process.py');

    } catch (error) {
      console.error('Error triggering legacy exports:', error);
    }
  };

  /**
   * Full export workflow - combines all export processes
   */
  public runFullExportWorkflow = async (): Promise<void> => {
    try {
      console.log('Starting full export workflow...');

      // Step 1: Export to master datasets (compatible with existing system)
      await this.exportToMasterDatasets();

      // Step 2: Generate system exports
      await this.generateSystemExports();

      // Step 3: Trigger legacy processes if needed
      await this.triggerLegacyExports();

      console.log('Full export workflow completed successfully');

    } catch (error) {
      console.error('Error in full export workflow:', error);
      throw error;
    }
  };
}

export const pricelistExportService = new PricelistExportService();
