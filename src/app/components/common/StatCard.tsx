import type { ReactNode } from 'react';

import { cn } from '@/app/components/ui/utils';

interface StatCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  className?: string;
  valueClassName?: string;
}

export function StatCard({ label, value, detail, icon, className, valueClassName }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-[1.6rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4 shadow-sm',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </div>
      <div className={cn('mt-2 break-words font-display text-2xl text-foreground', valueClassName)}>
        {value}
      </div>
      {detail ? <div className="mt-2 text-sm text-muted-foreground">{detail}</div> : null}
    </div>
  );
}
