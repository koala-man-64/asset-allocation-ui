import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/app/components/ui/button';
import { Progress } from '@/app/components/ui/progress';
import { cn } from '@/app/components/ui/utils';
import { config } from '@/config';
import { consumePostLoginRedirectPath, useAuth } from '@/contexts/AuthContext';
import { DataService } from '@/services/DataService';

type AccessState = 'idle' | 'checking' | 'allowed' | 'forbidden' | 'error';
type AuthStepId = 'sign-in' | 'redirect' | 'access';
type StepTone = 'pending' | 'active' | 'complete' | 'error';

const DEPLOYMENT_AUTH_MISCONFIGURED_BODY =
  'This deployment requires browser OIDC before the UI can call protected API routes. Set UI_OIDC_CLIENT_ID, UI_OIDC_AUTHORITY, UI_OIDC_SCOPES, and UI_OIDC_REDIRECT_URI. The deployed UI only supports OIDC.';
const AUTH_STEPS: Array<{ id: AuthStepId; label: string; description: string }> = [
  {
    id: 'sign-in',
    label: 'Sign in',
    description: 'Start a browser-backed Microsoft Entra session for this deployment.'
  },
  {
    id: 'redirect',
    label: 'Microsoft redirect',
    description: 'Hand off to Microsoft Entra and return with a verified browser session.'
  },
  {
    id: 'access',
    label: 'API access',
    description: 'Confirm the protected API accepts the authenticated session and role assignment.'
  }
];
const STEP_PROGRESS: Record<AuthStepId, number> = {
  'sign-in': 18,
  redirect: 54,
  access: 88
};
const SLOW_REDIRECT_HELPER =
  'The browser is still working. If nothing changes, check redirect or popup blocking and try again.';
const SLOW_ACCESS_HELPER =
  'The browser is still working. If nothing changes, try again and confirm the sign-in redirect was not blocked earlier.';

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

function resolveRailLabel(activeStep?: AuthStepId, errorStep?: AuthStepId, busy = false) {
  if (errorStep) {
    return 'Needs attention';
  }
  if (busy) {
    return 'In progress';
  }
  if (activeStep) {
    return activeStep === 'sign-in' ? 'Ready to continue' : 'Session in motion';
  }
  return 'Unavailable';
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
  secondaryActionDisabled = false
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
}) {
  const progressValue = resolveProgressValue(activeStep, completedSteps, errorStep);
  const railLabel = resolveRailLabel(activeStep, errorStep, busy);
  const accentClass = resolveStatusAccent(errorStep, busy);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-6 py-12">
      <section
        className="w-full max-w-5xl rounded-[2rem] border border-border/70 bg-card/95 shadow-[0_24px_80px_-48px_rgba(119,63,26,0.7)] backdrop-blur"
        data-testid="auth-status-screen"
      >
        <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] md:p-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Asset Allocation
              </p>
              <div className="max-w-2xl">
                <h2 className="font-display text-[clamp(2rem,4vw,3.3rem)] leading-[0.95] text-foreground">
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
                  Auth flow
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">{railLabel}</p>
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

            <Progress className="mt-4 h-1.5 bg-mcm-walnut/10" value={progressValue} />

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
      onAction={() => auth.signIn('/system-status')}
      statusLabel="The Microsoft Entra redirect did not finish successfully."
      title="Sign-in could not be completed"
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
    setAccessState('checking');
    setErrorMessage('');

    void DataService.getSystemHealthWithMeta()
      .then(() => {
        if (!cancelled) {
          setAccessState('allowed');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        if (/API Error:\s*403\b/.test(message)) {
          setAccessState('forbidden');
          return;
        }
        setAccessState('error');
        setErrorMessage(message);
      });

    return () => {
      cancelled = true;
    };
  }, [auth.authenticated, auth.phase, auth.ready, browserOidcMisconfigured, retryNonce]);

  if (browserOidcMisconfigured) {
    return (
      <AuthStatusScreen
        body={DEPLOYMENT_AUTH_MISCONFIGURED_BODY}
        statusLabel="The browser OIDC configuration is incomplete for this deployment."
        title="Deployment auth misconfigured"
      />
    );
  }

  if (!config.oidcEnabled || !config.authRequired) {
    return <>{children}</>;
  }

  if (!auth.ready || auth.phase === 'initializing') {
    return (
      <AuthStatusScreen
        activeStep="sign-in"
        body="Loading the Microsoft Entra session before protected application data is requested."
        busy
        statusLabel="Preparing the browser session and checking for an existing sign-in."
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
        body="Handing off to Microsoft Entra so the browser can complete the protected sign-in flow."
        busy
        completedSteps={['sign-in']}
        helperMessage={showRedirectHelper ? SLOW_REDIRECT_HELPER : undefined}
        onAction={() => auth.signIn(`${location.pathname}${location.search}${location.hash}`)}
        statusLabel="Redirecting the browser to Microsoft Entra now."
        title="Redirecting to sign in"
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
        statusLabel="Signing out and redirecting away from the protected session."
        title="Signing you out"
      />
    );
  }

  if (!auth.authenticated) {
    return (
      <AuthStatusScreen
        actionLabel={auth.error ? 'Try again' : 'Sign in'}
        activeStep="sign-in"
        body={
          auth.error ||
          'This deployment requires Microsoft Entra authentication before the UI can load protected API data.'
        }
        completedSteps={[]}
        errorStep={auth.error ? 'redirect' : undefined}
        onAction={() => auth.signIn(`${location.pathname}${location.search}${location.hash}`)}
        statusLabel={
          auth.error
            ? 'Microsoft Entra did not start the redirect flow successfully.'
            : 'Waiting for you to start the protected sign-in flow.'
        }
        title="Sign in required"
      />
    );
  }

  if (accessState === 'checking' || accessState === 'idle') {
    return (
      <AuthStatusScreen
        activeStep="access"
        body="Your session is valid. Verifying that your Microsoft Entra assignment is allowed to use the API."
        busy
        completedSteps={['sign-in', 'redirect']}
        helperMessage={showAccessHelper ? SLOW_ACCESS_HELPER : undefined}
        statusLabel="Checking protected API access for the authenticated session."
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
        onAction={auth.signOut}
        statusLabel="Authentication completed, but the API rejected the current role assignment."
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
          'The application could not verify your access against the API. Retry the check or sign out.'
        }
        completedSteps={['sign-in', 'redirect']}
        errorStep="access"
        onAction={() => {
          setAccessState('idle');
          setRetryNonce((value) => value + 1);
        }}
        onSecondaryAction={auth.signOut}
        secondaryActionLabel="Sign out"
        statusLabel="The protected API access check failed before the application could load."
        title="Access check failed"
      />
    );
  }

  return <>{children}</>;
}
