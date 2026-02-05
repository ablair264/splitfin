/**
 * Offline-aware Data Service
 *
 * Provides offline support for data operations using localStorage/IndexedDB caching.
 *
 * NOTE: This service has been converted from Supabase to use the new backend API pattern.
 * The original service wrapped Supabase calls with offline support. Since we no longer
 * use Supabase directly from the frontend, this service now provides:
 *
 * 1. Network status monitoring
 * 2. Local caching via offlineManager (IndexedDB)
 * 3. Response type compatibility for existing consumers
 *
 * For actual data operations, consumers should use the typed services directly:
 * - productService
 * - orderService
 * - customerService
 * - invoiceService
 * - authService
 *
 * This service is maintained for backward compatibility and can be used for
 * offline-first scenarios where data should be cached locally.
 */

import { offlineManager } from './offlineManager';

export interface OfflineDataResponse<T = unknown> {
  data: T | null;
  error: Error | null;
  isFromCache: boolean;
  isLocal: boolean;
}

class OfflineDataService {
  private isOnline: boolean = navigator.onLine;

  constructor() {
    offlineManager.addNetworkListener((isOnline) => {
      this.isOnline = isOnline;
    });
  }

  /**
   * Get data with offline cache support
   * For new code, prefer using typed services (productService, etc.) directly
   *
   * @param cacheKey - Key to use for caching (e.g., 'products', 'orders')
   * @param fetchFn - Async function that fetches data from the backend API
   */
  async getWithCache<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>
  ): Promise<OfflineDataResponse<T>> {
    try {
      if (this.isOnline) {
        // Try network first
        const data = await fetchFn();

        // Cache successful responses
        if (data) {
          await offlineManager.cacheData(cacheKey, Array.isArray(data) ? data : [data]);
        }

        return { data, error: null, isFromCache: false, isLocal: false };
      } else {
        throw new Error('Network unavailable');
      }
    } catch (error) {
      console.log(`Network error for ${cacheKey}, checking cache...`);

      // Try cache
      const cachedData = await offlineManager.getCachedData(cacheKey);
      if (cachedData) {
        return {
          data: cachedData as T,
          error: null,
          isFromCache: true,
          isLocal: false
        };
      }

      // Try local data
      const localData = await offlineManager.getLocalRecords(cacheKey);
      if (localData.length > 0) {
        return {
          data: localData as T,
          error: null,
          isFromCache: false,
          isLocal: true
        };
      }

      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        isFromCache: false,
        isLocal: false
      };
    }
  }

  /**
   * Cache data for offline use
   */
  async cacheData(cacheKey: string, data: unknown[]): Promise<void> {
    await offlineManager.cacheData(cacheKey, data);
  }

  /**
   * Get cached data
   */
  async getCachedData<T>(cacheKey: string): Promise<T | null> {
    return await offlineManager.getCachedData(cacheKey) as T | null;
  }

  /**
   * Store a pending operation for later sync
   * Used when making changes while offline
   */
  async storePendingOperation(
    table: string,
    operation: 'create' | 'update' | 'delete',
    data: unknown
  ): Promise<string> {
    return await offlineManager.storeOfflineRequest(
      `/api/v1/${table}`,
      operation === 'create' ? 'POST' : operation === 'update' ? 'PUT' : 'DELETE',
      {
        'Content-Type': 'application/json'
      },
      data,
      table,
      operation
    );
  }

  /**
   * Create a local record for immediate UI feedback
   */
  async createLocalRecord(table: string, data: unknown): Promise<string> {
    return await offlineManager.createLocalRecord(table, data);
  }

  /**
   * Get local records for a table
   */
  async getLocalRecords<T>(table: string): Promise<T[]> {
    return await offlineManager.getLocalRecords(table) as T[];
  }

  /**
   * Apply client-side filters to data array
   * Useful for filtering cached data
   */
  applyFilters<T extends Record<string, unknown>>(
    data: T[],
    filters: Record<string, unknown>
  ): T[] {
    return data.filter(item => {
      return Object.entries(filters).every(([key, value]) => {
        if (Array.isArray(value)) {
          return value.includes(item[key]);
        }
        if (typeof value === 'object' && value !== null && 'operator' in value) {
          const filterValue = value as { operator: string; value: unknown };
          const itemValue = item[key];
          switch (filterValue.operator) {
            case 'gte': return (itemValue as number) >= (filterValue.value as number);
            case 'gt': return (itemValue as number) > (filterValue.value as number);
            case 'lte': return (itemValue as number) <= (filterValue.value as number);
            case 'lt': return (itemValue as number) < (filterValue.value as number);
            case 'neq': return itemValue !== filterValue.value;
            case 'like':
            case 'ilike':
              return String(itemValue).toLowerCase().includes(String(filterValue.value).toLowerCase());
            default: return itemValue === filterValue.value;
          }
        }
        return item[key] === value;
      });
    });
  }

  /**
   * Get network and sync status
   */
  async getStatus(): Promise<{
    isOnline: boolean;
    pendingRequests: number;
    localRecords: number;
    lastSync: number | null;
  }> {
    return await offlineManager.getOfflineStatus();
  }

  /**
   * Check if currently online
   */
  getNetworkStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Manually trigger sync of pending operations
   */
  async sync(): Promise<void> {
    return await offlineManager.syncOfflineData();
  }

  /**
   * Add a listener for network status changes
   */
  addNetworkListener(callback: (isOnline: boolean) => void): void {
    offlineManager.addNetworkListener(callback);
  }

  /**
   * Remove a network status listener
   */
  removeNetworkListener(callback: (isOnline: boolean) => void): void {
    offlineManager.removeNetworkListener(callback);
  }
}

// Export singleton instance
export const offlineDataService = new OfflineDataService();

// Keep old export name for backward compatibility
export const offlineSupabase = offlineDataService;
