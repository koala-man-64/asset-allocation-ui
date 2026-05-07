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
    <div className={cn('rounded-sm border border-border bg-[#0b1326] p-2 shadow-none', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </div>
      <div
        className={cn(
          'mt-1 break-words font-mono text-base font-semibold text-foreground',
          valueClassName
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}
