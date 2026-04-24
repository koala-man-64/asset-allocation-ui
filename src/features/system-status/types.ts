import type {
  JobCategory,
  JobMetadataSource,
  JobMetadataStatus,
  ResourceSignal
} from '@/types/strategy';

export interface ManagedContainerJob {
  name: string;
  jobCategory?: JobCategory | null;
  jobKey?: string | null;
  jobRole?: string | null;
  triggerOwner?: string | null;
  metadataSource?: JobMetadataSource | null;
  metadataStatus?: JobMetadataStatus | null;
  metadataErrors?: string[] | null;
  runningState?: string | null;
  lastModifiedAt?: string | null;
  signals?: ResourceSignal[] | null;
}
