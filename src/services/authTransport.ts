type HeadersInit = Headers | [string, string][] | Record<string, string>;

export type AccessTokenProvider = () => Promise<string | null>;
export type InteractiveAuthRequest = {
  reason?: string;
  returnPath?: string;
};
export type InteractiveAuthHandler = (request?: InteractiveAuthRequest) => Promise<void> | void;

export class AuthInteractionRequiredError extends Error {
  constructor(message = 'Interactive sign-in is required.') {
    super(message);
    this.name = 'AuthInteractionRequiredError';
  }
}

export class AuthRedirectStartedError extends Error {
  constructor(message = 'Interactive sign-in redirect started.') {
    super(message);
    this.name = 'AuthRedirectStartedError';
  }
}

let accessTokenProvider: AccessTokenProvider | null = null;
let interactiveAuthHandler: InteractiveAuthHandler | null = null;

export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
}

export function setInteractiveAuthHandler(handler: InteractiveAuthHandler | null): void {
  interactiveAuthHandler = handler;
}

export function hasInteractiveAuthHandler(): boolean {
  return interactiveAuthHandler !== null;
}

export function createInteractionRequiredError(message?: string): AuthInteractionRequiredError {
  return new AuthInteractionRequiredError(message);
}

export function isAuthInteractionRequiredError(error: unknown): error is AuthInteractionRequiredError {
  return error instanceof AuthInteractionRequiredError;
}

export function isAuthRedirectStartedError(error: unknown): error is AuthRedirectStartedError {
  return error instanceof AuthRedirectStartedError;
}

export async function requestInteractiveReauth(
  request: InteractiveAuthRequest = {}
): Promise<never> {
  if (!interactiveAuthHandler) {
    throw new Error('Interactive auth redirect handler is not registered.');
  }

  await interactiveAuthHandler(request);
  throw new AuthRedirectStartedError(request.reason);
}

export async function appendAuthHeaders(headersInput?: HeadersInit): Promise<Headers> {
  const headers = new Headers(headersInput as HeadersInit);

  if (accessTokenProvider && !headers.has('Authorization')) {
    let token: string | null = null;
    try {
      token = await accessTokenProvider();
    } catch (error) {
      if (isAuthInteractionRequiredError(error)) {
        await requestInteractiveReauth({ reason: error.message });
      }
      throw error;
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}
