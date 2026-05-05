import type { ReactNode } from 'react';

import { cn } from '@/app/components/ui/utils';
import { StatCard } from '@/app/components/common/StatCard';

export interface PageHeroMetric {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  className?: string;
  valueClassName?: string;
}

interface PageHeroProps {
  kicker: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  metrics?: PageHeroMetric[];
  className?: string;
  contentClassName?: string;
  sideClassName?: string;
  metricsClassName?: string;
}

export function PageHero({
  kicker,
  title,
  subtitle,
  actions,
  metrics,
  className,
  contentClassName,
  sideClassName,
  metricsClassName
}: PageHeroProps) {
  const hasSideContent = Boolean(actions) || Boolean(metrics?.length);

  return (
    <section className={cn('page-header-row items-start gap-6', className)}>
      <div className={cn('page-header min-w-0 flex-1', contentClassName)}>
        <p className="page-kicker">{kicker}</p>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle max-w-3xl">{subtitle}</p> : null}
      </div>

      {hasSideContent ? (
        <div className={cn('flex w-full max-w-[56rem] flex-col gap-3', sideClassName)}>
          {actions ? (
            <div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end">
              {actions}
            </div>
          ) : null}
          {metrics?.length ? (
            <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', metricsClassName)}>
              {metrics.map((metric) => (
                <StatCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  detail={metric.detail}
                  icon={metric.icon}
                  className={metric.className}
                  valueClassName={metric.valueClassName}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
