import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';
import {
  InteractionRequiredAuthError,
  PublicClientApplication
} from '@azure/msal-browser';

type MsalSessionConfig = {
  enabled: boolean;
  clientId: string;
  authority: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
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
  scopes: string[];
};

export type MsalSessionHandle = {
  ensureInitialized: () => Promise<PublicClientApplication>;
  getRedirectInFlight: () => boolean;
  setRedirectInFlight: (value: boolean) => void;
  runBootstrap: (request: BootstrapRequest) => Promise<MsalBootstrapResult>;
};

let activeSessionRecord: MsalSessionRecord | null = null;

function buildSessionKey(config: MsalSessionConfig): string {
  return JSON.stringify({
    clientId: config.clientId,
    authority: config.authority,
    redirectUri: config.redirectUri,
    postLogoutRedirectUri: config.postLogoutRedirectUri,
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

  return {
    key: buildSessionKey(config),
    instance,
    ensureInitialized: () => {
      if (!initializationPromise) {
        initializationPromise = instance.initialize().then(() => instance);
      }
      return initializationPromise;
    },
    redirectInFlight: false,
    bootstrapPromise: null,
    bootstrapKey: null,
    completedBootstrapKeys: new Set<string>(),
    scopes: [...config.scopes]
  };
}

function getSessionRecord(config: MsalSessionConfig): MsalSessionRecord {
  const nextKey = buildSessionKey(config);
  if (!activeSessionRecord || activeSessionRecord.key !== nextKey) {
    activeSessionRecord = createSessionRecord(config);
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
    },
    runBootstrap: async (request: BootstrapRequest) => {
      const bootstrapKey = buildBootstrapKey(request);
      if (record.bootstrapPromise && record.bootstrapKey === bootstrapKey) {
        return record.bootstrapPromise;
      }

      if (record.completedBootstrapKeys.has(bootstrapKey)) {
        const instance = await record.ensureInitialized();
        return {
          redirectResult: null,
          account: chooseAccount(instance),
          interactionRequired: false
        };
      }

      const bootstrapPromise = (async (): Promise<MsalBootstrapResult> => {
        const instance = await record.ensureInitialized();
        const redirectResult = await instance.handleRedirectPromise({
          navigateToLoginRequestUrl: false
        });
        const redirectAccount = chooseAccount(instance, redirectResult);
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
          const silentResult = await instance.ssoSilent({
            scopes: record.scopes
          });
          return {
            redirectResult,
            account: chooseAccount(instance, silentResult),
            interactionRequired: false
          };
        } catch (error) {
          if (error instanceof InteractionRequiredAuthError) {
            return {
              redirectResult,
              account: null,
              interactionRequired: true
            };
          }
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
