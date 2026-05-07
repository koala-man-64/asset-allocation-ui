import type { ReactNode } from 'react';

import { cn } from '@/app/components/ui/utils';

interface PostgresDockWindowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}

export function PostgresDockWindow({
  title,
  subtitle,
  icon,
  actions,
  footer,
  children,
  className,
  bodyClassName,
  testId
}: PostgresDockWindowProps) {
  return (
    <section className={cn('postgres-dock-window', className)} data-testid={testId}>
      <div className="postgres-dock-titlebar">
        <div className="postgres-dock-titlegroup">
          {icon ? <span className="postgres-dock-icon">{icon}</span> : null}
          <div className="min-w-0">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="postgres-dock-actions">{actions}</div> : null}
      </div>
      <div className={cn('postgres-dock-body', bodyClassName)}>{children}</div>
      {footer ? <div className="postgres-dock-footer">{footer}</div> : null}
    </section>
  );
}
