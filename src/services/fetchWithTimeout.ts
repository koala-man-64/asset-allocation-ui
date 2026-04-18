/* global RequestInit */

export interface FetchWithOptionalTimeoutOptions {
  timeoutMs?: number;
  label: string;
  requestId?: string;
  timeoutMessagePrefix?: string;
}

export async function fetchWithOptionalTimeout(
  url: string,
  init: RequestInit,
  options: FetchWithOptionalTimeoutOptions
): Promise<Response> {
  const { timeoutMs, label, requestId, timeoutMessagePrefix = 'Request timeout after' } = options;

  let timeoutController: AbortController | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let mergedSignal: AbortSignal | null | undefined = init.signal;
  let removeExternalAbortListener: (() => void) | undefined;

  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutController = new AbortController();
    timeoutHandle = setTimeout(() => {
      timeoutController?.abort();
    }, Math.max(1, Math.floor(timeoutMs)));

    if (init.signal) {
      if (init.signal.aborted) {
        timeoutController.abort();
      } else {
        const relayAbort = () => timeoutController?.abort();
        init.signal.addEventListener('abort', relayAbort, { once: true });
        removeExternalAbortListener = () => init.signal?.removeEventListener('abort', relayAbort);
      }
    }

    mergedSignal = timeoutController.signal;
  }

  try {
    return await fetch(url, {
      ...init,
      signal: mergedSignal ?? undefined
    });
  } catch (error) {
    if (timeoutController?.signal.aborted && !init.signal?.aborted) {
      const suffix = requestId ? ` [requestId=${requestId}]` : '';
      throw new Error(
        `${timeoutMessagePrefix} ${Math.floor(timeoutMs || 0)}ms${suffix} - ${label}`
      );
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (removeExternalAbortListener) {
      removeExternalAbortListener();
    }
  }
}
