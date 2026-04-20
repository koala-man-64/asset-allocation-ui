import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import { config } from '@/config';
import {
  consumePostLoginRedirectPath,
  peekPostLoginRedirectPath,
  useAuth
} from '@/contexts/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { ApiError } from '@/services/apiService';
import { DataService } from '@/services/DataService';
import type { InteractiveAuthRequest } from '@/services/authTransport';
import { isAuthReauthRequiredError } from '@/services/authTransport';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

type AccessState = 'idle' | 'checking' | 'allowed' | 'forbidden' | 'error';
type AuthStepId = 'sign-in' | 'redirect' | 'access';
type StepTone = 'pending' | 'active' | 'complete' | 'error';
type AuthScreenLayout = 'fullscreen' | 'inline';
type AuthDiagnostic = {
  id: string;
  label: string;
  value: string;
};

const DEPLOYMENT_AUTH_MISCONFIGURED_BODY =
  'This deployment requires browser OIDC before the UI can call protected API routes. Set UI_OIDC_CLIENT_ID, UI_OIDC_AUTHORITY, UI_OIDC_SCOPES, and UI_OIDC_REDIRECT_URI. The deployed UI only supports OIDC.';
const AUTH_STEPS: Array<{ id: AuthStepId; label: string; description: string }> = [
  {
    id: 'sign-in',
    label: 'Restore session',
    description: 'Recover an existing Microsoft Entra session silently before interrupting the user.'
  },
  {
    id: 'redirect',
    label: 'Interactive sign-in',
    description: 'Redirect only when Microsoft Entra requires browser interaction.'
  },
  {
    id: 'access',
    label: 'API access',
    description: 'Confirm the authenticated session is allowed to call the protected control plane.'
  }
];
const STEP_PROGRESS: Record<AuthStepId, number> = {
  'sign-in': 24,
  redirect: 58,
  access: 92
};
const SLOW_REDIRECT_HELPER =
  'The redirect is taking longer than expected. If this browser blocks sign-in, retry the flow.';
const SLOW_ACCESS_HELPER =
  'The session is authenticated, but the control plane is still validating access. Retry if this does not clear.';

function logAuthGate(
  event: string,
  detail: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
) {
  logUiDiagnostic('AuthGate', event, detail, level);
}

function createDiagnostic(
  id: string,
  label: string,
  value?: string | number | null
): AuthDiagnostic | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return { id, label, value: normalized };
}

function collectDiagnostics(
  ...diagnostics: Array<AuthDiagnostic | null | undefined | false>
): AuthDiagnostic[] {
  return diagnostics.filter(Boolean) as AuthDiagnostic[];
}

function formatRoute(pathname: string, search = '', hash = ''): string {
  return `${pathname || '/'}${search || ''}${hash || ''}` || '/';
}

function extractRequestId(message: string): string {
  const match = String(message ?? '').match(/\[requestId=([^\]]+)\]/i);
  return match?.[1]?.trim() ?? '';
}

function buildInteractionDiagnostics(
  request: InteractiveAuthRequest | null,
  route: string
): AuthDiagnostic[] {
  return collectDiagnostics(
    createDiagnostic('route', 'Route', route),
    createDiagnostic('reason', 'Reason', request?.reason),
    createDiagnostic('source', 'Source', request?.source),
    createDiagnostic('endpoint', 'Endpoint', request?.endpoint),
    createDiagnostic('status', 'Status', request?.status),
    createDiagnostic('request-id', 'Request ID', request?.requestId),
    createDiagnostic(
      'recovery-attempt',
      'Silent retries',
      request?.recoveryAttempt && request.recoveryAttempt > 0 ? request.recoveryAttempt : null
    )
  );
}

function resolveCrossOriginRedirectMisconfiguration(redirectUri: string): string {
  const normalizedRedirectUri = String(redirectUri ?? '').trim();
  if (!normalizedRedirectUri || typeof window === 'undefined') {
    return '';
  }

  try {
    const redirectUrl = new URL(normalizedRedirectUri, window.location.origin);
    if (redirectUrl.origin === window.location.origin) {
      return '';
    }

    return `This deployment is advertising oidcRedirectUri=${redirectUrl.toString()}, which sends Microsoft Entra back to ${redirectUrl.origin} instead of this UI origin (${window.location.origin}). Update the control-plane UI_OIDC_REDIRECT_URI or let the UI runtime override load before retrying sign-in.`;
  } catch {
    return `This deployment is advertising an invalid oidcRedirectUri (${normalizedRedirectUri}). Update the control-plane OIDC settings before retrying sign-in.`;
  }
}

function useDelayedHelper(enabled: boolean, delayMs = 4000) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, enabled]);

  return visible;
}

function resolveStepTone(
  stepId: AuthStepId,
  activeStep?: AuthStepId,
  completedSteps: AuthStepId[] = [],
  errorStep?: AuthStepId
): StepTone {
  if (errorStep === stepId) {
    return 'error';
  }
  if (activeStep === stepId) {
    return 'active';
  }
  if (completedSteps.includes(stepId)) {
    return 'complete';
  }
  return 'pending';
}

function resolveProgressValue(
  activeStep?: AuthStepId,
  completedSteps: AuthStepId[] = [],
  errorStep?: AuthStepId
) {
  if (activeStep) {
    return STEP_PROGRESS[activeStep];
  }
  if (errorStep) {
    return STEP_PROGRESS[errorStep];
  }
  const lastCompleted = completedSteps[completedSteps.length - 1];
  return lastCompleted ? STEP_PROGRESS[lastCompleted] : 0;
}

function resolveStatusAccent(errorStep?: AuthStepId, busy = false) {
  if (errorStep) {
    return 'bg-destructive';
  }
  return busy ? 'bg-mcm-teal' : 'bg-mcm-mustard';
}

function AuthStatusScreen({
  title,
  body,
  statusLabel,
  helperMessage,
  recoveryItems = [],
  nextSteps = [],
  diagnostics = [],
  activeStep,
  completedSteps = [],
  errorStep,
  busy = false,
  actionLabel,
  onAction,
  actionDisabled = false,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionDisabled = false,
  layout = 'inline'
}: {
  title: string;
  body: string;
  statusLabel: string;
  helperMessage?: string;
  recoveryItems?: string[];
  nextSteps?: string[];
  diagnostics?: AuthDiagnostic[];
  activeStep?: AuthStepId;
  completedSteps?: AuthStepId[];
  errorStep?: AuthStepId;
  busy?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionDisabled?: boolean;
  layout?: AuthScreenLayout;
}) {
  const progressValue = resolveProgressValue(activeStep, completedSteps, errorStep);
  const accentClass = resolveStatusAccent(errorStep, busy);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const normalizedRecoveryItems = recoveryItems.filter(Boolean);
  const normalizedNextSteps = nextSteps.filter(Boolean);
  const normalizedDiagnostics = diagnostics.filter((diagnostic) => Boolean(diagnostic?.value));

  useEffect(() => {
    if (actionDisabled || !actionLabel || !onAction) {
      return;
    }
    primaryActionRef.current?.focus();
  }, [actionDisabled, actionLabel, onAction, title, statusLabel, body]);

  return (
    <div
      className={cn(
        'w-full',
        layout === 'fullscreen'
          ? 'flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-12'
          : 'py-6'
      )}
    >
      <section
        className={cn(
          'w-full overflow-hidden rounded-[2rem] border border-border/70 bg-card/95 shadow-[0_24px_80px_-48px_rgba(119,63,26,0.7)] backdrop-blur',
          layout === 'fullscreen' ? 'max-w-5xl' : 'mx-auto max-w-4xl'
        )}
        data-testid="auth-status-screen"
      >
        <div className="h-1.5 bg-mcm-walnut/10">
          <div
            className={cn(
              'h-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
              errorStep ? 'bg-destructive' : busy ? 'bg-mcm-teal' : 'bg-mcm-mustard'
            )}
            data-testid="auth-progress-bar"
            style={{ width: `${progressValue}%` }}
          />
        </div>

        <div
          className={cn(
            'grid gap-6 p-6 md:p-8',
            layout === 'fullscreen'
              ? 'md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]'
              : 'lg:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]'
          )}
        >
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Secure Access
              </p>
              <div className="max-w-2xl">
                <h2 className="font-display text-[clamp(1.8rem,3.4vw,3rem)] leading-[0.95] text-foreground">
                  {title}
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
                  {body}
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              <section
                aria-atomic="true"
                aria-busy={busy}
                aria-live="polite"
                className="rounded-[1.5rem] border border-border/60 bg-background/55 px-4 py-4"
                data-testid="auth-incident-what-happened"
                role="status"
              >
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1 h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_6px_rgba(0,0,0,0.04)]',
                      accentClass,
                      busy && 'motion-safe:animate-pulse motion-reduce:animate-none'
                    )}
                    data-testid="auth-status-indicator"
                  />
                  <div className="space-y-1">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      What happened
                    </p>
                    <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
                    {helperMessage ? (
                      <p className="text-sm leading-6 text-muted-foreground">{helperMessage}</p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section
                className="rounded-[1.5rem] border border-border/60 bg-background/45 px-4 py-4"
                data-testid="auth-incident-recovery"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  What the app already tried
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                  {normalizedRecoveryItems.map((item, index) => (
                    <li className="flex items-start gap-3" key={`${item}-${index}`}>
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-mcm-teal" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className="rounded-[1.5rem] border border-border/60 bg-mcm-paper/75 px-4 py-4"
                data-testid="auth-incident-next-step"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Your next action
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                  {normalizedNextSteps.map((item, index) => (
                    <li className="flex items-start gap-3" key={`${item}-${index}`}>
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-mcm-mustard" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {(actionLabel || secondaryActionLabel) && (
              <div className="flex flex-wrap gap-3">
                {actionLabel ? (
                  <Button
                    disabled={actionDisabled || !onAction}
                    onClick={onAction}
                    ref={primaryActionRef}
                  >
                    {actionLabel}
                  </Button>
                ) : null}
                {secondaryActionLabel ? (
                  <Button
                    disabled={secondaryActionDisabled || !onSecondaryAction}
                    onClick={onSecondaryAction}
                    variant="outline"
                  >
                    {secondaryActionLabel}
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-border/60 bg-background/70 p-5 shadow-inner">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Incident brief
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {errorStep ? 'Needs attention' : busy ? 'In progress' : 'Standing by'}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]',
                    errorStep
                      ? 'bg-destructive/10 text-destructive'
                      : busy
                        ? 'bg-mcm-teal/10 text-mcm-teal'
                        : 'bg-mcm-mustard/20 text-mcm-walnut'
                  )}
                >
                  {Math.round(progressValue)}%
                </span>
              </div>

              <ol className="mt-5 space-y-3">
                {AUTH_STEPS.map((step) => {
                  const tone = resolveStepTone(step.id, activeStep, completedSteps, errorStep);

                  return (
                    <li
                      aria-current={tone === 'active' ? 'step' : undefined}
                      className={cn(
                        'rounded-2xl border px-4 py-3 transition-colors motion-reduce:transition-none',
                        tone === 'active' && 'border-mcm-teal/60 bg-mcm-teal/10',
                        tone === 'complete' && 'border-mcm-mustard/45 bg-mcm-mustard/10',
                        tone === 'error' && 'border-destructive/50 bg-destructive/10',
                        tone === 'pending' && 'border-border/55 bg-background/40'
                      )}
                      data-state={tone}
                      data-testid={`auth-step-${step.id}`}
                      key={step.id}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full',
                            tone === 'active' &&
                              'bg-mcm-teal motion-safe:animate-pulse motion-reduce:animate-none',
                            tone === 'complete' && 'bg-mcm-mustard',
                            tone === 'error' && 'bg-destructive',
                            tone === 'pending' && 'bg-border/50'
                          )}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-foreground">{step.label}</p>
                            <span
                              className={cn(
                                'text-[0.62rem] font-semibold uppercase tracking-[0.18em]',
                                tone === 'active' && 'text-mcm-teal',
                                tone === 'complete' && 'text-mcm-walnut',
                                tone === 'error' && 'text-destructive',
                                tone === 'pending' && 'text-muted-foreground'
                              )}
                            >
                              {tone === 'active'
                                ? 'Active'
                                : tone === 'complete'
                                  ? 'Done'
                                  : tone === 'error'
                                    ? 'Issue'
                                    : 'Pending'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {normalizedDiagnostics.length > 0 ? (
              <section
                className="rounded-[1.5rem] border border-border/60 bg-mcm-paper/70 p-5"
                data-testid="auth-diagnostics"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Diagnostic facts
                </p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {normalizedDiagnostics.map((diagnostic) => (
                    <div
                      className="rounded-2xl border border-border/60 bg-background/55 px-3 py-3"
                      data-testid={`auth-diagnostic-${diagnostic.id}`}
                      key={diagnostic.id}
                    >
                      <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {diagnostic.label}
                      </dt>
                      <dd className="mt-2 break-words font-mono text-xs text-foreground">
                        {diagnostic.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function RealtimeEnabledContent({ children }: { children: ReactNode }) {
  useRealtime();
  return <>{children}</>;
}

function formatAccessError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? 'Unknown error');
}

export function OidcCallbackPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const showSlowHelper = useDelayedHelper(!auth.ready || auth.phase === 'redirecting');
  const route = formatRoute(location.pathname, location.search, location.hash);
  const callbackDiagnostics = useMemo(
    () =>
      collectDiagnostics(
        createDiagnostic('route', 'Route', route),
        createDiagnostic('return-path', 'Return path', peekPostLoginRedirectPath()),
        createDiagnostic('reason', 'Reason', auth.error)
      ),
    [auth.error, route]
  );

  useEffect(() => {
    if (!config.oidcEnabled) {
      navigate('/', { replace: true });
      return;
    }
    if (!auth.ready || !auth.authenticated) {
      return;
    }
    navigate(consumePostLoginRedirectPath(), { replace: true });
  }, [auth.authenticated, auth.ready, navigate, config.oidcEnabled]);

  if (!config.oidcEnabled) {
    return null;
  }
  if (!auth.ready || auth.phase === 'redirecting') {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="Microsoft Entra is finishing the browser handoff so the application can restore protected access in this tab."
        busy
        completedSteps={['sign-in']}
        diagnostics={callbackDiagnostics}
        helperMessage={showSlowHelper ? SLOW_REDIRECT_HELPER : undefined}
        layout="fullscreen"
        nextSteps={['Keep this tab open until the redirect completes.']}
        recoveryItems={[
          'Saved your original deep link so the application can return you there after sign-in.',
          'Paused protected data requests until the redirect flow completes.'
        ]}
        statusLabel="Waiting for Microsoft Entra to return control to the application."
        title="Signing you in"
      />
    );
  }
  if (auth.authenticated) {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="The browser session is restored. The application is returning you to the protected route you were using before sign-in."
        busy
        completedSteps={['sign-in']}
        diagnostics={callbackDiagnostics}
        layout="fullscreen"
        nextSteps={['Wait while the application returns you to the saved route automatically.']}
        recoveryItems={[
          'Completed the Microsoft Entra callback for this browser session.',
          'Prepared the protected return path that was saved before sign-in started.'
        ]}
        statusLabel="Authentication is complete. Redirecting back to your original page."
        title="Redirecting"
      />
    );
  }
  return (
    <AuthStatusScreen
      actionLabel="Try again"
      activeStep="sign-in"
      body="Microsoft Entra did not complete the browser handoff cleanly, so the application kept protected data paused."
      completedSteps={[]}
      diagnostics={callbackDiagnostics}
      errorStep="redirect"
      layout="fullscreen"
      nextSteps={['Use Try again to restart sign-in and return to the saved route.']}
      onAction={() => auth.signIn(peekPostLoginRedirectPath())}
      recoveryItems={[
        'Held the application on a safe callback screen instead of loading protected routes.',
        'Preserved the deep link so the retry can send you back to the same page.'
      ]}
      helperMessage={auth.error || undefined}
      statusLabel="The Microsoft Entra redirect did not finish successfully."
      title="Sign-in could not be completed"
    />
  );
}

export function OidcLogoutCompletePage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const route = formatRoute(location.pathname, location.search, location.hash);
  const diagnostics = useMemo(
    () => collectDiagnostics(createDiagnostic('route', 'Route', route)),
    [route]
  );

  useEffect(() => {
    if (!config.oidcEnabled) {
      navigate('/', { replace: true });
    }
  }, [navigate, config.oidcEnabled]);

  if (!config.oidcEnabled) {
    return null;
  }

  if (!auth.ready || auth.phase === 'signing-out') {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="The protected browser session is being cleared and the application is holding on a neutral screen until sign-out finishes."
        busy
        completedSteps={['sign-in']}
        diagnostics={diagnostics}
        layout="fullscreen"
        nextSteps={['Keep this tab open until sign-out completes.']}
        recoveryItems={[
          'Sent the browser through the Microsoft Entra sign-out flow.',
          'Cleared the protected return path stored in this tab.'
        ]}
        statusLabel="Finishing sign-out."
        title="Signing you out"
      />
    );
  }

  return (
    <AuthStatusScreen
      actionLabel={config.authRequired ? 'Sign in again' : 'Return to app'}
      activeStep="sign-in"
      body="The protected browser session has been cleared. You can safely start a new sign-in whenever you need protected access again."
      completedSteps={[]}
      diagnostics={diagnostics}
      layout="fullscreen"
      nextSteps={[
        config.authRequired
          ? 'Use Sign in again when you are ready to restore protected access.'
          : 'Use Return to app to go back to the public shell.'
      ]}
      onAction={() => {
        if (config.authRequired) {
          auth.signIn();
          return;
        }
        navigate('/', { replace: true });
      }}
      recoveryItems={[
        'Confirmed that the protected sign-in flow has ended for this browser tab.',
        'Kept the app on a neutral signed-out page so it does not reload protected data automatically.'
      ]}
      statusLabel="Signed out successfully."
      title="Signed out"
    />
  );
}

export function OidcAccessGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const [accessState, setAccessState] = useState<AccessState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryNonce, setRetryNonce] = useState(0);
  const route = formatRoute(location.pathname, location.search, location.hash);
  const missingBrowserOidcConfig = config.authRequired && (!config.oidcEnabled || !auth.enabled);
  const crossOriginRedirectMisconfiguration = resolveCrossOriginRedirectMisconfiguration(
    config.oidcRedirectUri
  );
  const browserOidcMisconfigured =
    missingBrowserOidcConfig || Boolean(crossOriginRedirectMisconfiguration);
  const accessCheckPending = auth.authenticated && (accessState === 'checking' || accessState === 'idle');
  const showRedirectHelper = useDelayedHelper(auth.phase === 'redirecting');
  const showAccessHelper = useDelayedHelper(accessCheckPending);
  const signInDiagnostics = useMemo(
    () =>
      collectDiagnostics(
        createDiagnostic('route', 'Route', route),
        createDiagnostic('reason', 'Reason', auth.error)
      ),
    [auth.error, route]
  );
  const sessionExpiredDiagnostics = useMemo(
    () => buildInteractionDiagnostics(auth.interactionRequest, route),
    [auth.interactionRequest, route]
  );
  const accessErrorDiagnostics = useMemo(
    () =>
      collectDiagnostics(
        createDiagnostic('route', 'Route', route),
        createDiagnostic('request-id', 'Request ID', extractRequestId(errorMessage))
      ),
    [errorMessage, route]
  );
  const misconfiguredDiagnostics = useMemo(
    () =>
      collectDiagnostics(
        createDiagnostic('route', 'Route', route),
        createDiagnostic('advertised-callback', 'Advertised callback', config.oidcRedirectUri),
        createDiagnostic(
          'ui-origin',
          'UI origin',
          typeof window !== 'undefined' ? window.location.origin : null
        )
      ),
    [route, config.oidcRedirectUri]
  );

  useEffect(() => {
    logAuthGate('state-snapshot', {
      route,
      authReady: auth.ready,
      authPhase: auth.phase,
      authenticated: auth.authenticated,
      authEnabled: auth.enabled,
      accessState,
      retryNonce,
      authError: auth.error,
      interactionReason: auth.interactionReason,
      browserOidcMisconfigured,
      missingBrowserOidcConfig,
      crossOriginRedirectMisconfiguration: crossOriginRedirectMisconfiguration || null,
      apiBaseUrl: config.apiBaseUrl,
      oidcRedirectUri: config.oidcRedirectUri || null
    });
  }, [
    accessState,
    auth.authenticated,
    auth.enabled,
    auth.error,
    auth.interactionReason,
    auth.phase,
    auth.ready,
    browserOidcMisconfigured,
    crossOriginRedirectMisconfiguration,
    missingBrowserOidcConfig,
    retryNonce,
    route
  ]);

  useEffect(() => {
    if (browserOidcMisconfigured) {
      logAuthGate('access-check-skipped-misconfigured', {
        route,
        advertisedCallback: config.oidcRedirectUri || null,
        uiOrigin: typeof window !== 'undefined' ? window.location.origin : null
      }, 'warn');
      setAccessState('idle');
      setErrorMessage('');
      return;
    }
    if (!config.oidcEnabled || !config.authRequired) {
      logAuthGate('access-check-bypassed-auth-disabled', {
        route,
        oidcEnabled: config.oidcEnabled,
        authRequired: config.authRequired
      });
      setAccessState('allowed');
      setErrorMessage('');
      return;
    }
    if (!auth.ready || auth.phase === 'redirecting' || auth.phase === 'signing-out') {
      logAuthGate('access-check-waiting-auth-state', {
        route,
        authReady: auth.ready,
        authPhase: auth.phase
      });
      setAccessState('idle');
      setErrorMessage('');
      return;
    }
    if (!auth.authenticated) {
      logAuthGate('access-check-waiting-authenticated-session', {
        route,
        authReady: auth.ready,
        authPhase: auth.phase
      });
      setAccessState('idle');
      setErrorMessage('');
      return;
    }

    let cancelled = false;

    const handleAccessError = (error: unknown) => {
      if (cancelled) {
        return;
      }
      if (isAuthReauthRequiredError(error)) {
        logAuthGate('access-check-reauth-required', {
          route,
          error
        }, 'warn');
        setAccessState('idle');
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        logAuthGate('access-check-forbidden', {
          route,
          error: formatAccessError(error),
          requestId: extractRequestId(formatAccessError(error))
        }, 'warn');
        setErrorMessage(formatAccessError(error));
        setAccessState('forbidden');
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        logAuthGate('access-check-unauthorized', {
          route,
          error: formatAccessError(error),
          requestId: extractRequestId(formatAccessError(error))
        }, 'warn');
        setAccessState('idle');
        return;
      }
      logAuthGate('access-check-failed', {
        route,
        error
      }, 'error');
      setAccessState('error');
      setErrorMessage(formatAccessError(error));
    };

    const verifyAccess = async () => {
      setAccessState('checking');
      setErrorMessage('');
      logAuthGate('access-check-start', {
        route,
        retryNonce,
        primaryEndpoint: '/auth/session',
        fallbackEndpoint: '/system/health'
      });

      try {
        const response = await DataService.getAuthSessionStatusWithMeta();
        if (!cancelled) {
          logAuthGate('access-check-success', {
            route,
            endpoint: '/auth/session',
            requestId: response.meta.requestId,
            status: response.meta.status,
            durationMs: response.meta.durationMs,
            url: response.meta.url
          });
          setAccessState('allowed');
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          console.info(
            '[Auth] /api/auth/session is unavailable on this control-plane build. Falling back to /api/system/health.'
          );
          logAuthGate('access-check-fallback-start', {
            route,
            fromEndpoint: '/auth/session',
            toEndpoint: '/system/health',
            error: formatAccessError(error)
          }, 'warn');
          try {
            const response = await DataService.getSystemHealthWithMeta();
            if (!cancelled) {
              logAuthGate('access-check-fallback-success', {
                route,
                endpoint: '/system/health',
                requestId: response.meta.requestId,
                status: response.meta.status,
                durationMs: response.meta.durationMs,
                url: response.meta.url
              });
              setAccessState('allowed');
            }
            return;
          } catch (fallbackError) {
            handleAccessError(fallbackError);
            return;
          }
        }
        handleAccessError(error);
      }
    };

    void verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [auth.authenticated, auth.phase, auth.ready, browserOidcMisconfigured, retryNonce]);

  if (browserOidcMisconfigured) {
    return (
      <AuthStatusScreen
        body={crossOriginRedirectMisconfiguration || DEPLOYMENT_AUTH_MISCONFIGURED_BODY}
        diagnostics={misconfiguredDiagnostics}
        layout="inline"
        nextSteps={['Update the deployment OIDC settings, then reload the UI.']}
        recoveryItems={[
          'Validated the browser OIDC configuration before allowing protected routes to load.',
          'Stopped protected API traffic because the callback configuration is unsafe for this UI origin.'
        ]}
        statusLabel={
          crossOriginRedirectMisconfiguration
            ? 'The advertised OIDC callback points to a different origin than this UI.'
            : 'The browser OIDC configuration is incomplete for this deployment.'
        }
        title="Deployment auth misconfigured"
      />
    );
  }

  if (!config.oidcEnabled || !config.authRequired) {
    return <RealtimeEnabledContent>{children}</RealtimeEnabledContent>;
  }

  if (!auth.ready || auth.phase === 'initializing') {
    return (
      <AuthStatusScreen
        activeStep="sign-in"
        body="The application is checking whether this browser already has a reusable Microsoft Entra session."
        busy
        diagnostics={collectDiagnostics(createDiagnostic('route', 'Route', route))}
        layout="inline"
        nextSteps={['Wait while the session check finishes.']}
        recoveryItems={[
          'Paused protected queries before the app shell could request control-plane data.',
          'Checked for an existing browser session that can be restored without user interruption.'
        ]}
        statusLabel="Checking for an existing authenticated browser session."
        title="Preparing secure access"
      />
    );
  }

  if (auth.phase === 'redirecting') {
    return (
      <AuthStatusScreen
        actionDisabled
        actionLabel="Redirecting..."
        activeStep="redirect"
        body="Protected access needs browser interaction. Microsoft Entra is taking over briefly so the session can be completed safely."
        busy
        completedSteps={['sign-in']}
        diagnostics={collectDiagnostics(createDiagnostic('route', 'Route', route))}
        helperMessage={showRedirectHelper ? SLOW_REDIRECT_HELPER : undefined}
        layout="inline"
        nextSteps={['Complete the browser sign-in flow and return to this tab.']}
        onAction={() => auth.signIn(`${location.pathname}${location.search}${location.hash}`)}
        recoveryItems={[
          'Saved the current route so the application can return here after sign-in.',
          'Started the Microsoft Entra redirect before any protected data was allowed to load.'
        ]}
        statusLabel="Redirecting the browser to Microsoft Entra."
        title="Continuing sign-in"
      />
    );
  }

  if (auth.phase === 'signing-out') {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="The protected browser session is ending and the application is clearing access for this tab."
        busy
        completedSteps={['sign-in']}
        diagnostics={collectDiagnostics(createDiagnostic('route', 'Route', route))}
        layout="inline"
        nextSteps={['Wait while the sign-out redirect completes.']}
        recoveryItems={[
          'Stopped protected queries and realtime session bootstrap for this tab.',
          'Started the Microsoft Entra sign-out redirect with the current account context.'
        ]}
        statusLabel="Signing out."
        title="Signing you out"
      />
    );
  }

  if (!auth.authenticated) {
    if (auth.phase === 'session-expired') {
      return (
        <AuthStatusScreen
          actionLabel="Continue sign-in"
          activeStep="sign-in"
          body="Protected data stayed paused because the current browser session could not be reused safely."
          completedSteps={[]}
          diagnostics={sessionExpiredDiagnostics}
          errorStep="sign-in"
          layout="inline"
          nextSteps={['Use Continue sign-in to restore protected access and return to this route.']}
          onAction={() => auth.signIn(`${location.pathname}${location.search}${location.hash}`)}
          recoveryItems={[
            auth.interactionRequest?.recoveryAttempt
              ? 'Retried the protected request once with a forced silent token refresh.'
              : 'Checked whether the current browser session could be restored silently.',
            'Held protected queries until a fresh interactive sign-in can be completed.'
          ]}
          helperMessage={auth.interactionReason || undefined}
          statusLabel="The protected session needs a fresh sign-in before data can load."
          title="Session expired"
        />
      );
    }

    return (
      <AuthStatusScreen
        actionLabel={auth.error ? 'Try again' : 'Continue sign-in'}
        activeStep="sign-in"
        body="Protected routes remain paused until this browser completes Microsoft Entra sign-in."
        completedSteps={[]}
        diagnostics={signInDiagnostics}
        errorStep={auth.error ? 'redirect' : undefined}
        layout="inline"
        nextSteps={[
          auth.error
            ? 'Use Try again to restart the browser sign-in flow.'
            : 'Use Continue sign-in to start the protected browser flow.'
        ]}
        onAction={() => auth.signIn(`${location.pathname}${location.search}${location.hash}`)}
        recoveryItems={[
          'Checked for an existing browser session before prompting for sign-in.',
          auth.error
            ? 'Kept the app on a safe signed-out screen after the redirect could not start.'
            : 'Held protected queries until you explicitly continue.'
        ]}
        helperMessage={auth.error || undefined}
        statusLabel={
          auth.error
            ? 'Microsoft Entra did not start the redirect flow successfully.'
            : 'Waiting to start protected sign-in.'
        }
        title="Sign-in required"
      />
    );
  }

  if (accessState === 'checking' || accessState === 'idle') {
    return (
      <AuthStatusScreen
        activeStep="access"
        body="The browser session is authenticated. The control plane is now confirming that the session and role assignment are still valid."
        busy
        completedSteps={['sign-in', 'redirect']}
        diagnostics={collectDiagnostics(createDiagnostic('route', 'Route', route))}
        helperMessage={showAccessHelper ? SLOW_ACCESS_HELPER : undefined}
        layout="inline"
        nextSteps={['Wait while the protected access probe finishes.']}
        recoveryItems={[
          'Completed Microsoft Entra sign-in for this tab.',
          'Started a control-plane access probe before any protected data could render.'
        ]}
        statusLabel="Checking control-plane access."
        title="Checking access"
      />
    );
  }

  if (accessState === 'forbidden') {
    return (
      <AuthStatusScreen
        actionLabel="Sign out"
        activeStep="access"
        body="Microsoft Entra authenticated the browser, but the control plane rejected the current role assignment. Ask an administrator to grant the AssetAllocation.Access role."
        completedSteps={['sign-in', 'redirect']}
        diagnostics={accessErrorDiagnostics}
        errorStep="access"
        layout="inline"
        nextSteps={['Sign out and switch accounts, or ask an administrator to grant the required role.']}
        onAction={auth.signOut}
        recoveryItems={[
          'Validated the browser session against Microsoft Entra.',
          'Checked the protected API session before loading any protected route data.'
        ]}
        helperMessage={errorMessage || undefined}
        statusLabel="Authentication completed, but the control plane rejected the current role assignment."
        title="Access denied"
      />
    );
  }

  if (accessState === 'error') {
    return (
      <AuthStatusScreen
        actionLabel="Retry"
        activeStep="access"
        body="The control-plane access probe failed before protected data could resume."
        completedSteps={['sign-in', 'redirect']}
        diagnostics={accessErrorDiagnostics}
        errorStep="access"
        layout="inline"
        nextSteps={['Use Retry to run the access check again, or sign out to start a new session.']}
        onAction={() => {
          setAccessState('idle');
          setRetryNonce((value) => value + 1);
        }}
        onSecondaryAction={auth.signOut}
        recoveryItems={[
          'Stopped automatic access recovery after the probe failed.',
          'Kept the current route in place without loading protected data.'
        ]}
        secondaryActionLabel="Sign out"
        helperMessage={
          errorMessage ||
          'The application could not verify your access against the control plane. Retry the check or sign out.'
        }
        statusLabel="The control-plane access check failed before protected data could load."
        title="Access check failed"
      />
    );
  }

  return <RealtimeEnabledContent>{children}</RealtimeEnabledContent>;
}
