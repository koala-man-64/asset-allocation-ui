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
  default: 'border-border bg-card text-foreground',
  info: 'border-cyan-400/35 bg-cyan-950/25 text-foreground',
  warning: 'border-yellow-300/35 bg-yellow-950/20 text-foreground',
  error: 'border-destructive/45 bg-destructive/10 text-destructive-foreground',
  empty: 'border-dashed border-border bg-[#0b1326] text-muted-foreground'
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
    <div className={cn('rounded-sm border p-3 shadow-none', toneClassNames[tone], className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className={cn('min-w-0 flex-1', contentClassName)}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase">
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <span>{title}</span>
          </div>
          <div className="mt-2 text-xs leading-5">{message}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
