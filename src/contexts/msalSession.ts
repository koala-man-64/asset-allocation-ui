import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';
import {
  InteractionRequiredAuthError,
  PublicClientApplication
} from '@azure/msal-browser';

import { logUiDiagnostic } from '@/services/uiDiagnostics';

type MsalSessionConfig = {
  enabled: boolean;
  clientId: string;
  authority: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  silentRedirectUri: string;
  scopes: string[];
};

type BootstrapRequest = {
  authRequired: boolean;
  pathname: string;
  onCallbackPath: boolean;
  onLogoutCompletePath: boolean;
};

export type MsalBootstrapResult = {
  redirectResult: AuthenticationResult | null;
  account: AccountInfo | null;
  interactionRequired: boolean;
};

type MsalSessionRecord = {
  key: string;
  instance: PublicClientApplication;
  ensureInitialized: () => Promise<PublicClientApplication>;
  redirectInFlight: boolean;
  bootstrapPromise: Promise<MsalBootstrapResult> | null;
  bootstrapKey: string | null;
  completedBootstrapKeys: Set<string>;
  silentRedirectUri: string;
  scopes: string[];
};

export type MsalSessionHandle = {
  ensureInitialized: () => Promise<PublicClientApplication>;
  getRedirectInFlight: () => boolean;
  setRedirectInFlight: (value: boolean) => void;
  runBootstrap: (request: BootstrapRequest) => Promise<MsalBootstrapResult>;
};

let activeSessionRecord: MsalSessionRecord | null = null;

function summarizeAccountForLogs(account: AccountInfo | null | undefined): Record<string, unknown> {
  if (!account) {
    return { present: false };
  }

  return {
    present: true,
    username: account.username ?? null,
    name: account.name ?? null,
    tenantId: account.tenantId ?? null,
    homeAccountId: account.homeAccountId ?? null
  };
}

function logMsalSession(
  event: string,
  detail: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  logUiDiagnostic('MsalSession', event, detail, level);
}

function buildSessionKey(config: MsalSessionConfig): string {
  return JSON.stringify({
    clientId: config.clientId,
    authority: config.authority,
    redirectUri: config.redirectUri,
    postLogoutRedirectUri: config.postLogoutRedirectUri,
    silentRedirectUri: config.silentRedirectUri,
    scopes: config.scopes
  });
}

function buildBootstrapKey(request: BootstrapRequest): string {
  return JSON.stringify(request);
}

function chooseAccount(instance: PublicClientApplication, result?: AuthenticationResult | null): AccountInfo | null {
  const account = result?.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
  if (account) {
    instance.setActiveAccount(account);
    logMsalSession('choose-account', {
      account: summarizeAccountForLogs(account),
      source: result?.account ? 'redirect-result' : instance.getActiveAccount() ? 'active-account' : 'account-list'
    });
  }
  return account;
}

function createSessionRecord(config: MsalSessionConfig): MsalSessionRecord {
  const instance = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: config.authority,
      redirectUri: config.redirectUri,
      postLogoutRedirectUri: config.postLogoutRedirectUri
    },
    cache: {
      cacheLocation: 'sessionStorage'
    }
  });

  let initializationPromise: Promise<PublicClientApplication> | null = null;

  logMsalSession('session-created', {
    authority: config.authority,
    clientIdConfigured: Boolean(config.clientId),
    redirectUri: config.redirectUri,
    postLogoutRedirectUri: config.postLogoutRedirectUri,
    silentRedirectUri: config.silentRedirectUri,
    scopes: config.scopes
  });

  return {
    key: buildSessionKey(config),
    instance,
    ensureInitialized: () => {
      if (!initializationPromise) {
        logMsalSession('initialize-start', {
          authority: config.authority,
          redirectUri: config.redirectUri
        });
        initializationPromise = instance
          .initialize()
          .then(() => {
            logMsalSession('initialize-success', {
              authority: config.authority,
              redirectUri: config.redirectUri
            });
            return instance;
          })
          .catch((error) => {
            logMsalSession(
              'initialize-failed',
              {
                authority: config.authority,
                redirectUri: config.redirectUri,
                error
              },
              'error'
            );
            throw error;
          });
      }
      return initializationPromise;
    },
    redirectInFlight: false,
    bootstrapPromise: null,
    bootstrapKey: null,
    completedBootstrapKeys: new Set<string>(),
    silentRedirectUri: config.silentRedirectUri,
    scopes: [...config.scopes]
  };
}

function getSessionRecord(config: MsalSessionConfig): MsalSessionRecord {
  const nextKey = buildSessionKey(config);
  if (!activeSessionRecord || activeSessionRecord.key !== nextKey) {
    activeSessionRecord = createSessionRecord(config);
  } else {
    logMsalSession('session-reused', {
      authority: config.authority,
      redirectUri: config.redirectUri,
      scopes: config.scopes
    });
  }
  return activeSessionRecord;
}

export function getMsalSession(config: MsalSessionConfig): MsalSessionHandle | null {
  if (!config.enabled) {
    return null;
  }

  const record = getSessionRecord(config);

  return {
    ensureInitialized: record.ensureInitialized,
    getRedirectInFlight: () => record.redirectInFlight,
    setRedirectInFlight: (value: boolean) => {
      record.redirectInFlight = value;
      logMsalSession('redirect-in-flight-set', { value });
    },
    runBootstrap: async (request: BootstrapRequest) => {
      const bootstrapKey = buildBootstrapKey(request);
      if (record.bootstrapPromise && record.bootstrapKey === bootstrapKey) {
        logMsalSession('bootstrap-join-inflight', {
          pathname: request.pathname,
          callback: request.onCallbackPath,
          logoutComplete: request.onLogoutCompletePath
        });
        return record.bootstrapPromise;
      }

      if (record.completedBootstrapKeys.has(bootstrapKey)) {
        const instance = await record.ensureInitialized();
        const account = chooseAccount(instance);
        logMsalSession('bootstrap-reused-completed-result', {
          pathname: request.pathname,
          account: summarizeAccountForLogs(account)
        });
        return {
          redirectResult: null,
          account,
          interactionRequired: false
        };
      }

      const bootstrapPromise = (async (): Promise<MsalBootstrapResult> => {
        logMsalSession('bootstrap-start', {
          pathname: request.pathname,
          callback: request.onCallbackPath,
          logoutComplete: request.onLogoutCompletePath,
          authRequired: request.authRequired
        });
        const instance = await record.ensureInitialized();
        const redirectResult = await instance.handleRedirectPromise({
          navigateToLoginRequestUrl: false
        });
        const redirectAccount = chooseAccount(instance, redirectResult);
        logMsalSession('bootstrap-handle-redirect-result', {
          pathname: request.pathname,
          hasRedirectResult: Boolean(redirectResult),
          account: summarizeAccountForLogs(redirectAccount)
        });
        if (redirectAccount) {
          return {
            redirectResult,
            account: redirectAccount,
            interactionRequired: false
          };
        }

        if (!request.authRequired || request.onLogoutCompletePath) {
          return {
            redirectResult,
            account: null,
            interactionRequired: false
          };
        }

        try {
          logMsalSession('bootstrap-sso-silent-start', {
            pathname: request.pathname,
            scopes: record.scopes,
            silentRedirectUri: record.silentRedirectUri || null
          });
          const silentResult = await instance.ssoSilent({
            scopes: record.scopes,
            redirectUri: record.silentRedirectUri || undefined
          });
          const account = chooseAccount(instance, silentResult);
          logMsalSession('bootstrap-sso-silent-success', {
            pathname: request.pathname,
            account: summarizeAccountForLogs(account)
          });
          return {
            redirectResult,
            account,
            interactionRequired: false
          };
        } catch (error) {
          if (error instanceof InteractionRequiredAuthError) {
            logMsalSession(
              'bootstrap-sso-silent-interaction-required',
              {
                pathname: request.pathname,
                scopes: record.scopes,
                error
              },
              'warn'
            );
            return {
              redirectResult,
              account: null,
              interactionRequired: true
            };
          }
          logMsalSession(
            'bootstrap-sso-silent-failed',
            {
              pathname: request.pathname,
              scopes: record.scopes,
              error
            },
            'error'
          );
          throw error;
        }
      })();

      record.bootstrapPromise = bootstrapPromise;
      record.bootstrapKey = bootstrapKey;

      try {
        const result = await bootstrapPromise;
        record.completedBootstrapKeys.add(bootstrapKey);
        return result;
      } finally {
        if (record.bootstrapPromise === bootstrapPromise) {
          record.bootstrapPromise = null;
          record.bootstrapKey = null;
        }
      }
    }
  };
}

export function resetMsalSessionForTests(): void {
  activeSessionRecord = null;
}
