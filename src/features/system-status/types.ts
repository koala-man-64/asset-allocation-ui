import type { ResourceSignal } from '@/types/strategy';

export interface ManagedContainerJob {
  name: string;
  runningState?: string | null;
  lastModifiedAt?: string | null;
  signals?: ResourceSignal[] | null;
}
