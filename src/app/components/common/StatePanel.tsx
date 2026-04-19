import type { ReactNode } from 'react';

import { cn } from '@/app/components/ui/utils';

type StateTone = 'default' | 'info' | 'warning' | 'error' | 'empty';

interface StatePanelProps {
  title: ReactNode;
  message: ReactNode;
  tone?: StateTone;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}

const toneClassNames: Record<StateTone, string> = {
  default: 'border-border/60 bg-background/70 text-foreground',
  info: 'border-mcm-teal/25 bg-accent/30 text-foreground',
  warning: 'border-mcm-mustard/30 bg-mcm-cream/80 text-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  empty: 'border-dashed border-mcm-walnut/35 bg-mcm-cream/70 text-muted-foreground'
};

export function StatePanel({
  title,
  message,
  tone = 'default',
  icon,
  action,
  className,
  contentClassName,
  children
}: StatePanelProps) {
  return (
    <div className={cn('rounded-[1.5rem] border p-5 shadow-sm', toneClassNames[tone], className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className={cn('min-w-0 flex-1', contentClassName)}>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em]">
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <span>{title}</span>
          </div>
          <div className="mt-3 text-sm leading-6">{message}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
