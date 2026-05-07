import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/app/components/ui/utils';
import { StatePanel } from './StatePanel';

type DeskGridVariant = 'standard' | 'explorer' | 'portfolio';

interface DeskGridProps extends ComponentPropsWithoutRef<'div'> {
  variant?: DeskGridVariant;
}

const deskGridClassName: Record<DeskGridVariant, string> = {
  standard: 'desk-grid-standard',
  explorer: 'desk-grid-explorer',
  portfolio: 'desk-grid-portfolio'
};

export function DeskGrid({ variant = 'standard', className, ...props }: DeskGridProps) {
  return <div className={cn(deskGridClassName[variant], className)} {...props} />;
}

interface DeskPaneProps extends ComponentPropsWithoutRef<'section'> {
  as?: 'section' | 'aside' | 'div';
  scrollable?: boolean;
}

export function DeskPane({
  as = 'section',
  scrollable = false,
  className,
  children,
  ...props
}: DeskPaneProps) {
  const Comp = as === 'aside' ? 'aside' : as === 'div' ? 'div' : 'section';

  return (
    <Comp
      className={cn('desk-pane flex min-h-0 flex-col', scrollable && 'overflow-auto', className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function SubPanel({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'rounded-sm border border-border/70 bg-background/45 p-3 shadow-none',
        className
      )}
      {...props}
    />
  );
}

interface MetricTileProps extends ComponentPropsWithoutRef<'div'> {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  valueClassName?: string;
}

export function MetricTile({
  label,
  value,
  detail,
  icon,
  className,
  valueClassName,
  ...props
}: MetricTileProps) {
  return (
    <div
      className={cn('rounded-sm border border-border bg-card p-3 shadow-none', className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </div>
      <div className={cn('mt-1 break-words font-mono text-base font-semibold', valueClassName)}>
        {value}
      </div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

interface PersistentStatusBannerProps {
  tone: 'info' | 'warning' | 'error' | 'empty' | 'default';
  title: ReactNode;
  message: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}

export function PersistentStatusBanner({
  tone,
  title,
  message,
  icon,
  action,
  className,
  testId
}: PersistentStatusBannerProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} data-testid={testId}>
      <StatePanel
        tone={tone}
        title={title}
        message={message}
        icon={icon}
        action={action}
        className={className}
      />
    </div>
  );
}
