import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
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
import { isAuthRedirectStartedError } from '@/services/authTransport';

type AccessState = 'idle' | 'checking' | 'allowed' | 'forbidden' | 'error';
type AuthStepId = 'sign-in' | 'redirect' | 'access';
type StepTone = 'pending' | 'active' | 'complete' | 'error';
type AuthScreenLayout = 'fullscreen' | 'inline';

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
              'h-full transition-[width] duration-300 ease-out',
              errorStep ? 'bg-destructive' : busy ? 'bg-mcm-teal' : 'bg-mcm-mustard'
            )}
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

            <div
              aria-atomic="true"
              aria-busy={busy}
              aria-live="polite"
              className="flex items-start gap-4 rounded-[1.5rem] border border-border/60 bg-background/55 px-4 py-4"
              role="status"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1 h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_6px_rgba(0,0,0,0.04)]',
                  accentClass,
                  busy && 'animate-pulse'
                )}
              />
              <div className="space-y-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Live status
                </p>
                <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
                {helperMessage ? (
                  <p className="text-sm leading-6 text-muted-foreground">{helperMessage}</p>
                ) : null}
              </div>
            </div>

            {(actionLabel || secondaryActionLabel) && (
              <div className="flex flex-wrap gap-3">
                {actionLabel ? (
                  <Button disabled={actionDisabled || !onAction} onClick={onAction}>
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

          <div className="rounded-[1.75rem] border border-border/60 bg-background/70 p-5 shadow-inner">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Auth rail
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
                      'rounded-2xl border px-4 py-3 transition-colors',
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
                          tone === 'active' && 'bg-mcm-teal animate-pulse',
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
  const navigate = useNavigate();
  const showSlowHelper = useDelayedHelper(!auth.ready || auth.phase === 'redirecting');

  useEffect(() => {
    if (!config.oidcEnabled) {
      navigate('/', { replace: true });
      return;
    }
    if (!auth.ready || !auth.authenticated) {
      return;
    }
    navigate(consumePostLoginRedirectPath(), { replace: true });
  }, [auth.authenticated, auth.ready, navigate]);

  if (!config.oidcEnabled) {
    return null;
  }
  if (!auth.ready || auth.phase === 'redirecting') {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="Completing the Microsoft Entra sign-in flow and restoring your session in this browser."
        busy
        completedSteps={['sign-in']}
        helperMessage={showSlowHelper ? SLOW_REDIRECT_HELPER : undefined}
        layout="fullscreen"
        statusLabel="Waiting for Microsoft Entra to return control to the application."
        title="Signing you in"
      />
    );
  }
  if (auth.authenticated) {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="Your session is ready. Sending you back into the application now."
        busy
        completedSteps={['sign-in']}
        layout="fullscreen"
        statusLabel="Authentication is complete. Redirecting back to your original page."
        title="Redirecting"
      />
    );
  }
  return (
    <AuthStatusScreen
      actionLabel="Try again"
      activeStep="sign-in"
      body={auth.error || 'Authentication did not complete successfully. Start the sign-in flow again.'}
      completedSteps={[]}
      errorStep="redirect"
      layout="fullscreen"
      onAction={() => auth.signIn(peekPostLoginRedirectPath())}
      statusLabel="The Microsoft Entra redirect did not finish successfully."
      title="Sign-in could not be completed"
    />
  );
}

export function OidcLogoutCompletePage() {
  const auth = useAuth();
  const navigate = useNavigate();

  if (!config.oidcEnabled) {
    navigate('/', { replace: true });
    return null;
  }

  if (!auth.ready || auth.phase === 'signing-out') {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="Closing the protected browser session and clearing the sign-in state."
        busy
        completedSteps={['sign-in']}
        layout="fullscreen"
        statusLabel="Finishing sign-out."
        title="Signing you out"
      />
    );
  }

  return (
    <AuthStatusScreen
      actionLabel={config.authRequired ? 'Sign in again' : 'Return to app'}
      activeStep="sign-in"
      body="The browser session has been signed out cleanly. You can start a new sign-in when you need protected access again."
      completedSteps={[]}
      layout="fullscreen"
      onAction={() => {
        if (config.authRequired) {
          auth.signIn();
          return;
        }
        navigate('/', { replace: true });
      }}
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
  const browserOidcMisconfigured = config.authRequired && (!config.oidcEnabled || !auth.enabled);
  const accessCheckPending = auth.authenticated && (accessState === 'checking' || accessState === 'idle');
  const showRedirectHelper = useDelayedHelper(auth.phase === 'redirecting');
  const showAccessHelper = useDelayedHelper(accessCheckPending);

  useEffect(() => {
    if (browserOidcMisconfigured) {
      setAccessState('idle');
      setErrorMessage('');
      return;
    }
    if (!config.oidcEnabled || !config.authRequired) {
      setAccessState('allowed');
      setErrorMessage('');
      return;
    }
    if (!auth.ready || auth.phase === 'redirecting' || auth.phase === 'signing-out') {
      setAccessState('idle');
      setErrorMessage('');
      return;
    }
    if (!auth.authenticated) {
      setAccessState('idle');
      setErrorMessage('');
      return;
    }

    let cancelled = false;

    const handleAccessError = (error: unknown) => {
      if (cancelled) {
        return;
      }
      if (isAuthRedirectStartedError(error)) {
        setAccessState('idle');
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setAccessState('forbidden');
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        setAccessState('idle');
        return;
      }
      setAccessState('error');
      setErrorMessage(formatAccessError(error));
    };

    const verifyAccess = async () => {
      setAccessState('checking');
      setErrorMessage('');

      try {
        await DataService.getAuthSessionStatusWithMeta();
        if (!cancelled) {
          setAccessState('allowed');
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          console.info(
            '[Auth] /api/auth/session is unavailable on this control-plane build. Falling back to /api/system/health.'
          );
          try {
            await DataService.getSystemHealthWithMeta();
            if (!cancelled) {
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
        body={DEPLOYMENT_AUTH_MISCONFIGURED_BODY}
        layout="inline"
        statusLabel="The browser OIDC configuration is incomplete for this deployment."
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
        body="Restoring the Microsoft Entra browser session before protected application data is requested."
        busy
        layout="inline"
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
        body="Microsoft Entra requires browser interaction. Redirecting now so the protected session can be completed."
        busy
        completedSteps={['sign-in']}
        helperMessage={showRedirectHelper ? SLOW_REDIRECT_HELPER : undefined}
        layout="inline"
        onAction={() => auth.signIn(`${location.pathname}${location.search}${location.hash}`)}
        statusLabel="Redirecting the browser to Microsoft Entra."
        title="Continuing sign-in"
      />
    );
  }

  if (auth.phase === 'signing-out') {
    return (
      <AuthStatusScreen
        activeStep="redirect"
        body="Ending the Microsoft Entra session and clearing protected application access."
        busy
        completedSteps={['sign-in']}
        layout="inline"
        statusLabel="Signing out."
        title="Signing you out"
      />
    );
  }

  if (!auth.authenticated) {
    return (
      <AuthStatusScreen
        actionLabel={auth.error ? 'Try again' : 'Continue sign-in'}
        activeStep="sign-in"
        body={
          auth.error ||
          'This deployment requires Microsoft Entra authentication before the UI can load protected API data.'
        }
        completedSteps={[]}
        errorStep={auth.error ? 'redirect' : undefined}
        layout="inline"
        onAction={() => auth.signIn(`${location.pathname}${location.search}${location.hash}`)}
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
        body="Your session is authenticated. Verifying that the control plane accepts this browser session and role assignment."
        busy
        completedSteps={['sign-in', 'redirect']}
        helperMessage={showAccessHelper ? SLOW_ACCESS_HELPER : undefined}
        layout="inline"
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
        body="You signed in successfully, but your Microsoft Entra account is not assigned the required application role for this API. Ask an administrator to grant the AssetAllocation.Access role."
        completedSteps={['sign-in', 'redirect']}
        errorStep="access"
        layout="inline"
        onAction={auth.signOut}
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
        body={
          errorMessage ||
          'The application could not verify your access against the control plane. Retry the check or sign out.'
        }
        completedSteps={['sign-in', 'redirect']}
        errorStep="access"
        layout="inline"
        onAction={() => {
          setAccessState('idle');
          setRetryNonce((value) => value + 1);
        }}
        onSecondaryAction={auth.signOut}
        secondaryActionLabel="Sign out"
        statusLabel="The control-plane access check failed before protected data could load."
        title="Access check failed"
      />
    );
  }

  return <RealtimeEnabledContent>{children}</RealtimeEnabledContent>;
}
