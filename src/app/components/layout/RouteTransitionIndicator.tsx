import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_INDICATOR_ACTIVE_MS = 280;
const ROUTE_INDICATOR_FADE_MS = 220;

export function RouteTransitionIndicator() {
  const location = useLocation();
  const [phase, setPhase] = useState<'idle' | 'animating' | 'finishing'>('idle');
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    setPhase('animating');
    const finishTimer = window.setTimeout(() => setPhase('finishing'), ROUTE_INDICATOR_ACTIVE_MS);
    const hideTimer = window.setTimeout(
      () => setPhase('idle'),
      ROUTE_INDICATOR_ACTIVE_MS + ROUTE_INDICATOR_FADE_MS
    );

    return () => {
      window.clearTimeout(finishTimer);
      window.clearTimeout(hideTimer);
    };
  }, [location.pathname, location.search, location.hash]);

  const phaseClass =
    phase === 'idle'
      ? 'w-0 opacity-0'
      : phase === 'animating'
        ? 'w-[72%] opacity-100'
        : 'w-full opacity-0';

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-[3px]">
      <div
        data-testid="route-transition-indicator"
        data-state={phase}
        className={`h-full bg-gradient-to-r from-mcm-teal via-primary to-mcm-mustard transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none ${phaseClass}`}
      />
    </div>
  );
}
