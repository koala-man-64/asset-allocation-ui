export type LogStreamResourceType = 'job' | 'container-app';

export type LogStreamFeedback = {
  tone: 'info' | 'error' | 'none';
  message: string | null;
};

const JOB_NOT_CONFIGURED_PATTERNS = [
  /azure job log retrieval is not configured/i,
  /log analytics is not configured for job log retrieval/i
];

const CONTAINER_APP_NOT_CONFIGURED_PATTERNS = [
  /container app log retrieval is not configured/i,
  /log analytics is not configured for container app log retrieval/i
];

const LOGS_READ_ROLE = 'AssetAllocation.System.Logs.Read';
const MISSING_REQUIRED_ROLE_PATTERN = /missing required roles?:/i;

function getNotConfiguredMessage(resourceType: LogStreamResourceType): string {
  if (resourceType === 'job') {
    return 'Live job logs are not configured for this environment.';
  }
  return 'Live console logs are not configured for this environment.';
}

function getMissingLogsRoleMessage(resourceType: LogStreamResourceType): string {
  const resourceLabel = resourceType === 'job' ? 'job logs' : 'console logs';
  return `Your session is missing ${LOGS_READ_ROLE}, so live ${resourceLabel} are hidden.`;
}

function isMissingLogsReadRole(message: string): boolean {
  return MISSING_REQUIRED_ROLE_PATTERN.test(message) && message.includes(LOGS_READ_ROLE);
}

export function getLogStreamFeedback(
  error: string | null | undefined,
  resourceType: LogStreamResourceType
): LogStreamFeedback {
  const message = String(error || '').trim();
  if (!message) {
    return { tone: 'none', message: null };
  }

  const patterns =
    resourceType === 'job' ? JOB_NOT_CONFIGURED_PATTERNS : CONTAINER_APP_NOT_CONFIGURED_PATTERNS;
  if (patterns.some((pattern) => pattern.test(message))) {
    return {
      tone: 'info',
      message: getNotConfiguredMessage(resourceType)
    };
  }

  if (isMissingLogsReadRole(message)) {
    return {
      tone: 'info',
      message: getMissingLogsRoleMessage(resourceType)
    };
  }

  return {
    tone: 'error',
    message
  };
}
