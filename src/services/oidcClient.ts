import {
  BrowserCacheLocation,
  LogLevel,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration
} from '@azure/msal-browser';

import { config } from '@/config';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

let oidcClient: PublicClientApplication | null = null;
let oidcClientReady: Promise<PublicClientApplication> | null = null;

function assertOidcConfigured(): void {
  if (
    !config.oidcEnabled ||
    !config.oidcAuthority ||
    !config.oidcClientId ||
    !config.oidcRedirectUri ||
    config.oidcScopes.length === 0
  ) {
    throw new Error('OIDC is not configured for this deployment.');
  }
}

function buildMsalConfiguration(): Configuration {
  assertOidcConfigured();
  return {
    auth: {
      authority: config.oidcAuthority,
      clientId: config.oidcClientId,
      postLogoutRedirectUri: config.oidcPostLogoutRedirectUri || undefined,
      redirectUri: config.oidcRedirectUri
    },
    cache: {
      cacheLocation: BrowserCacheLocation.MemoryStorage
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) {
            return;
          }
          if (level >= LogLevel.Error) {
            logUiDiagnostic('OIDC', 'msal-error', { message }, 'error');
          }
        }
      }
    }
  };
}

async function getOidcClient(): Promise<PublicClientApplication> {
  if (oidcClientReady) {
    return oidcClientReady;
  }

  oidcClient = new PublicClientApplication(buildMsalConfiguration());
  oidcClientReady = oidcClient.initialize().then(() => oidcClient as PublicClientApplication);
  return oidcClientReady;
}

function resolveAccount(
  app: PublicClientApplication,
  result?: AuthenticationResult | null
): AccountInfo | null {
  return result?.account || app.getActiveAccount() || app.getAllAccounts()[0] || null;
}

export async function startOidcLogin(): Promise<void> {
  const app = await getOidcClient();
  logUiDiagnostic('OIDC', 'login-redirect-started', {
    authority: config.oidcAuthority,
    clientIdConfigured: Boolean(config.oidcClientId),
    redirectUri: config.oidcRedirectUri
  });
  await app.loginRedirect({
    redirectUri: config.oidcRedirectUri,
    scopes: config.oidcScopes
  });
}

export async function consumeOidcRedirectAccessToken(): Promise<string> {
  const app = await getOidcClient();
  const result = await app.handleRedirectPromise({
    navigateToLoginRequestUrl: false
  });
  const account = resolveAccount(app, result);
  if (account) {
    app.setActiveAccount(account);
  }
  const accessToken = result?.accessToken;
  if (!accessToken) {
    throw new Error('OIDC callback did not return an access token.');
  }
  logUiDiagnostic('OIDC', 'callback-token-received', {
    hasAccount: Boolean(account),
    scopes: config.oidcScopes
  });
  return accessToken;
}

export async function startOidcLogout(): Promise<void> {
  const app = await getOidcClient();
  const account = resolveAccount(app, null);
  logUiDiagnostic('OIDC', 'logout-redirect-started', {
    hasAccount: Boolean(account),
    postLogoutRedirectUri: config.oidcPostLogoutRedirectUri || null
  });
  await app.logoutRedirect({
    account: account || undefined,
    postLogoutRedirectUri: config.oidcPostLogoutRedirectUri || undefined
  });
}

export function disposeOidcClient(): void {
  oidcClient = null;
  oidcClientReady = null;
}
