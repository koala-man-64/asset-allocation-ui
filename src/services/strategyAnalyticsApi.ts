import { request } from '@/services/apiService';
import type {
  StrategyAllocationExposureRequest,
  StrategyAllocationExposureResponse,
  StrategyComparisonRequest,
  StrategyComparisonResponse,
  StrategyScenarioForecastRequest,
  StrategyScenarioForecastResponse,
  StrategyTradeHistoryRequest,
  StrategyTradeHistoryResponse
} from '@/types/strategyAnalytics';

function validateComparisonRequest(payload: StrategyComparisonRequest): void {
  if (payload.strategies.length < 2) {
    throw new Error('Strategy comparison requires at least two strategies.');
  }

  if (payload.endDate < payload.startDate) {
    throw new Error('Strategy comparison end date cannot be before the start date.');
  }

  if (!payload.benchmarkSymbol?.trim()) {
    throw new Error('Strategy comparison requires a benchmark symbol.');
  }

  if (!payload.costModel.trim()) {
    throw new Error('Strategy comparison requires a cost model.');
  }

  if (!payload.barSize.trim()) {
    throw new Error('Strategy comparison requires a bar size.');
  }
}

function validateTradeHistoryRequest(payload: StrategyTradeHistoryRequest): void {
  if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
    throw new Error('Trade-history end date cannot be before the start date.');
  }
}

export const strategyAnalyticsApi = {
  async compareStrategies(
    payload: StrategyComparisonRequest,
    signal?: AbortSignal
  ): Promise<StrategyComparisonResponse> {
    validateComparisonRequest(payload);
    return request<StrategyComparisonResponse>('/strategies/analytics/compare', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async getScenarioForecast(
    payload: StrategyScenarioForecastRequest,
    signal?: AbortSignal
  ): Promise<StrategyScenarioForecastResponse> {
    if (!payload.strategies.length) {
      throw new Error('Strategy forecast requires at least one strategy.');
    }

    return request<StrategyScenarioForecastResponse>('/strategies/analytics/forecast', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async getAllocationExposure(
    payload: StrategyAllocationExposureRequest,
    signal?: AbortSignal
  ): Promise<StrategyAllocationExposureResponse> {
    return request<StrategyAllocationExposureResponse>('/strategies/analytics/allocations', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async getTradeHistory(
    payload: StrategyTradeHistoryRequest,
    signal?: AbortSignal
  ): Promise<StrategyTradeHistoryResponse> {
    validateTradeHistoryRequest(payload);
    return request<StrategyTradeHistoryResponse>('/strategies/analytics/trades', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  }
};
