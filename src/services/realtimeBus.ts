export const REALTIME_SUBSCRIBE_EVENT = 'asset-allocation:realtime-subscribe';
export const REALTIME_UNSUBSCRIBE_EVENT = 'asset-allocation:realtime-unsubscribe';
export const REALTIME_STATUS_EVENT = 'asset-allocation:realtime-status';
export const CONSOLE_LOG_STREAM_BROWSER_EVENT = 'asset-allocation:console-log-stream';
export const CONSOLE_LOG_STREAM_EVENT_TYPE = 'CONSOLE_LOG_STREAM';

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

export type RealtimeStatusDetail = {
  status: RealtimeConnectionStatus;
  message?: string;
  changedAt: string;
};

export type ConsoleLogStreamLine = {
  id: string;
  timestamp?: string;
  stream_s?: string | null;
  message: string;
  executionName?: string | null;
};

export type ConsoleLogStreamDetail = {
  topic: string;
  resourceType: 'job' | 'container-app';
  resourceName: string;
  lines: ConsoleLogStreamLine[];
  polledAt?: string;
};

function dispatchRealtimeEvent(eventName: string, topics: string[]): void {
  if (typeof window === 'undefined') return;
  const filtered = topics
    .map((topic) => String(topic || '').trim())
    .filter((topic) => topic.length > 0);
  if (filtered.length === 0) return;
  window.dispatchEvent(new CustomEvent(eventName, { detail: { topics: filtered } }));
}

export function buildJobLogTopic(jobName: string, executionName?: string | null): string {
  const normalizedJobName = String(jobName || '').trim();
  const normalizedExecutionName = String(executionName || '').trim();
  if (!normalizedExecutionName) {
    return `job-logs:${normalizedJobName}`;
  }
  return `job-logs:${normalizedJobName}/executions/${normalizedExecutionName}`;
}

export function buildJobLogTopics(jobName: string, executionName?: string | null): string[] {
  const jobTopic = buildJobLogTopic(jobName);
  const executionTopic = buildJobLogTopic(jobName, executionName);
  return Array.from(new Set([jobTopic, executionTopic])).filter((topic) => topic.trim().length > 0);
}

export function isJobLogTopicForJob(
  topic: string | null | undefined,
  jobName: string | null | undefined,
  executionName?: string | null
): boolean {
  const normalizedTopic = String(topic || '').trim();
  const normalizedJobName = String(jobName || '').trim();
  if (!normalizedTopic || !normalizedJobName) {
    return false;
  }

  const jobTopic = buildJobLogTopic(normalizedJobName);
  if (normalizedTopic === jobTopic) {
    return true;
  }

  const normalizedExecutionName = String(executionName || '').trim();
  if (
    normalizedExecutionName &&
    normalizedTopic === buildJobLogTopic(normalizedJobName, executionName)
  ) {
    return true;
  }

  return normalizedTopic.startsWith(`${jobTopic}/executions/`);
}

export function buildContainerAppLogTopic(appName: string): string {
  return `container-app-logs:${String(appName || '').trim()}`;
}

export function requestRealtimeSubscription(topics: string[]): void {
  dispatchRealtimeEvent(REALTIME_SUBSCRIBE_EVENT, topics);
}

export function requestRealtimeUnsubscription(topics: string[]): void {
  dispatchRealtimeEvent(REALTIME_UNSUBSCRIBE_EVENT, topics);
}

export function emitRealtimeStatus(detail: Omit<RealtimeStatusDetail, 'changedAt'>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(REALTIME_STATUS_EVENT, {
      detail: {
        ...detail,
        changedAt: new Date().toISOString()
      }
    })
  );
}

export function addRealtimeStatusListener(
  listener: (detail: RealtimeStatusDetail) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<RealtimeStatusDetail>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(REALTIME_STATUS_EVENT, handler);
  return () => window.removeEventListener(REALTIME_STATUS_EVENT, handler);
}

export function emitConsoleLogStream(detail: ConsoleLogStreamDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONSOLE_LOG_STREAM_BROWSER_EVENT, { detail }));
}

export function addConsoleLogStreamListener(
  listener: (detail: ConsoleLogStreamDetail) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ConsoleLogStreamDetail>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(CONSOLE_LOG_STREAM_BROWSER_EVENT, handler);
  return () => window.removeEventListener(CONSOLE_LOG_STREAM_BROWSER_EVENT, handler);
}
