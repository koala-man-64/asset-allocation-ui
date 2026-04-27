import type { QueryClient } from '@tanstack/react-query';

import { config } from '@/config';
import { queryKeys } from '@/hooks/useDataQueries';
import { DataService } from '@/services/DataService';

export function prefetchNavigationData(queryClient: QueryClient, path: string): void {
  if (config.authRequired) {
    return;
  }

  if (path === '/data-quality') {
    queryClient.prefetchQuery({
      queryKey: queryKeys.systemHealth(),
      queryFn: async () => {
        const response = await DataService.getSystemHealthWithMeta();
        return response.data;
      },
      staleTime: 30000
    });
  }

  if (path === '/system-status') {
    queryClient.prefetchQuery({
      queryKey: queryKeys.systemStatusView(),
      queryFn: async () => DataService.getSystemStatusView(),
      staleTime: 30000
    });
  }
}
