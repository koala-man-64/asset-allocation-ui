type HeadersInit = Headers | [string, string][] | Record<string, string>;

export type AccessTokenRequestOptions = {
  forceRefresh?: boolean;
};

export type AccessTokenProvider = (
  options?: AccessTokenRequestOptions
) => Promise<string | null>;
export type InteractiveAuthRequest = {
  reason?: string;
  returnPath?: string;
  source?: string;
  endpoint?: string;
  status?: number;
  requestId?: string;
  recoveryAttempt?: number;
};
export type InteractiveAuthHandler = (request?: InteractiveAuthRequest) => void;

export class AuthInteractionRequiredError extends Error {
  constructor(message = 'Interactive sign-in is required.') {
    super(message);
    this.name = 'AuthInteractionRequiredError';
  }
}

export class AuthReauthRequiredError extends Error {
  readonly request: InteractiveAuthRequest;

  constructor(request: InteractiveAuthRequest = {}) {
    super(request.reason || 'Interactive sign-in is required.');
    this.name = 'AuthReauthRequiredError';
    this.request = request;
  }
}

let accessTokenProvider: AccessTokenProvider | null = null;
let interactiveAuthHandler: InteractiveAuthHandler | null = null;
let pendingReauthRequest: InteractiveAuthRequest | null = null;

function resolveCurrentPath(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function normalizeInteractiveAuthRequest(request: InteractiveAuthRequest = {}): InteractiveAuthRequest {
  const reason = String(request.reason ?? '').trim();
  const returnPath = String(request.returnPath ?? '').trim() || resolveCurrentPath();
  const source = String(request.source ?? '').trim();
  const endpoint = String(request.endpoint ?? '').trim();
  const requestId = String(request.requestId ?? '').trim();
  const status =
    typeof request.status === 'number' && Number.isFinite(request.status)
      ? Math.floor(request.status)
      : undefined;
  const recoveryAttempt =
    typeof request.recoveryAttempt === 'number' && Number.isFinite(request.recoveryAttempt)
      ? Math.max(0, Math.floor(request.recoveryAttempt))
      : undefined;

  return {
    reason: reason || undefined,
    returnPath: returnPath || undefined,
    source: source || undefined,
    endpoint: endpoint || undefined,
    status,
    requestId: requestId || undefined,
    recoveryAttempt
  };
}

function logAuthTransport(event: string, request?: InteractiveAuthRequest): void {
  console.info(`[AuthTransport] ${event}`, {
    source: request?.source ?? null,
    reason: request?.reason ?? null,
    returnPath: request?.returnPath ?? null,
    endpoint: request?.endpoint ?? null,
    status: request?.status ?? null,
    requestId: request?.requestId ?? null,
    recoveryAttempt: request?.recoveryAttempt ?? null
  });
}

export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
}

export function setInteractiveAuthHandler(handler: InteractiveAuthHandler | null): void {
  interactiveAuthHandler = handler;
}

export function hasInteractiveAuthHandler(): boolean {
  return interactiveAuthHandler !== null;
}

export function clearReauthRequestState(): void {
  pendingReauthRequest = null;
}

export function createInteractionRequiredError(message?: string): AuthInteractionRequiredError {
  return new AuthInteractionRequiredError(message);
}

export function isAuthInteractionRequiredError(error: unknown): error is AuthInteractionRequiredError {
  return error instanceof AuthInteractionRequiredError;
}

export function isAuthReauthRequiredError(error: unknown): error is AuthReauthRequiredError {
  return error instanceof AuthReauthRequiredError;
}

export async function requestInteractiveReauth(
  request: InteractiveAuthRequest = {}
): Promise<never> {
  if (!interactiveAuthHandler) {
    throw new Error('Interactive auth state handler is not registered.');
  }

  const normalizedRequest = normalizeInteractiveAuthRequest(request);
  if (!pendingReauthRequest) {
    pendingReauthRequest = normalizedRequest;
    logAuthTransport('reauth-required', normalizedRequest);
    interactiveAuthHandler(normalizedRequest);
  } else {
    logAuthTransport('reauth-required-suppressed', normalizedRequest);
  }

  throw new AuthReauthRequiredError(pendingReauthRequest);
}

async function appendAuthHeadersWithOptions(
  headers: Headers,
  options: AccessTokenRequestOptions
): Promise<Headers> {
  if (accessTokenProvider && !headers.has('Authorization')) {
    let token: string | null = null;
    try {
      token = await accessTokenProvider(options);
    } catch (error) {
      if (isAuthInteractionRequiredError(error)) {
        await requestInteractiveReauth({
          reason: error.message,
          source: 'access-token-provider',
          recoveryAttempt: options.forceRefresh ? 1 : 0
        });
      }
      throw error;
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

export async function appendAuthHeaders(
  headersInput?: HeadersInit,
  options: AccessTokenRequestOptions = {}
): Promise<Headers> {
  const headers = new Headers(headersInput as HeadersInit);
  return appendAuthHeadersWithOptions(headers, options);
}

export function resetAuthTransportForTests(): void {
  accessTokenProvider = null;
  interactiveAuthHandler = null;
  pendingReauthRequest = null;
}
