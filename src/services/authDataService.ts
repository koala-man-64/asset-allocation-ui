import type { AuthSessionStatus, ResponseWithMeta } from '@/services/apiService';
import { apiService } from '@/services/apiService';

export const authDataService = {
  getAuthSessionStatusWithMeta(): Promise<ResponseWithMeta<AuthSessionStatus>> {
    return apiService.getAuthSessionStatusWithMeta();
  }
};
