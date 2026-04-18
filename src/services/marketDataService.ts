import type { FinanceData, MarketData } from '@/types/data';
import type {
  AdlsFilePreviewResponse,
  AdlsTreeResponse,
  DataProfilingResponse,
  ResponseWithMeta,
  StockScreenerResponse,
  StorageUsageResponse,
  ValidationReport
} from '@/services/apiService';
import type { SystemHealth } from '@/types/strategy';
import { apiService } from '@/services/apiService';

export type { FinanceData, MarketData };

export const marketDataService = {
  getMarketData(
    ticker: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<MarketData[]> {
    return apiService.getMarketData(ticker, layer, signal);
  },

  getFinanceData(
    ticker: string,
    subDomain: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<FinanceData[]> {
    return apiService.getFinanceData(ticker, subDomain, layer, signal);
  },

  getSystemHealth(params: { refresh?: boolean } = {}): Promise<SystemHealth> {
    return apiService.getSystemHealth(params);
  },

  getSystemHealthWithMeta(
    params: { refresh?: boolean } = {}
  ): Promise<ResponseWithMeta<SystemHealth>> {
    return apiService.getSystemHealthWithMeta(params);
  },

  getStockScreener(
    params: {
      q?: string;
      limit?: number;
      offset?: number;
      asOf?: string;
      sort?: string;
      direction?: 'asc' | 'desc';
    } = {},
    signal?: AbortSignal
  ): Promise<StockScreenerResponse> {
    return apiService.getStockScreener(params, signal);
  },

  getGenericData(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    ticker?: string,
    limit?: number,
    optionsOrSignal?: { sortByDate?: 'asc' | 'desc' } | AbortSignal,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>[]> {
    return apiService.getGenericData(layer, domain, ticker, limit, optionsOrSignal, signal);
  },

  getDataQualityValidation(
    layer: string,
    domain: string,
    tickerOrSignal?: string | AbortSignal,
    signal?: AbortSignal
  ): Promise<ValidationReport> {
    return apiService.getDataQualityValidation(layer, domain, tickerOrSignal, signal);
  },

  getDataProfile(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    column: string,
    params: {
      ticker?: string;
      bins?: number;
      sampleRows?: number;
      topValues?: number;
    } = {},
    signal?: AbortSignal
  ): Promise<DataProfilingResponse> {
    return apiService.getDataProfile(layer, domain, column, params, signal);
  },

  getStorageUsage(signal?: AbortSignal): Promise<StorageUsageResponse> {
    return apiService.getStorageUsage(signal);
  },

  getAdlsTree(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path?: string;
      maxEntries?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsTreeResponse> {
    return apiService.getAdlsTree(params, signal);
  },

  getAdlsFilePreview(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path: string;
      maxBytes?: number;
      maxDeltaFiles?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsFilePreviewResponse> {
    return apiService.getAdlsFilePreview(params, signal);
  }
};
