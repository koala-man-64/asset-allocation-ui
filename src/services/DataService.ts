import { authDataService } from '@/services/authDataService';
import { marketDataService } from '@/services/marketDataService';
import { systemDataService } from '@/services/systemDataService';

export { authDataService, marketDataService, systemDataService };
export type { FinanceData, MarketData } from '@/services/marketDataService';

export const DataService = {
  ...authDataService,
  ...marketDataService,
  ...systemDataService
};
