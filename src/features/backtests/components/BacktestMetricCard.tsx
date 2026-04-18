import { cn } from '@/app/components/ui/utils';

export function BacktestMetricCard({
  label,
  value,
  detail,
  emphasis = 'default'
}: {
  label: string;
  value: string;
  detail: string;
  emphasis?: 'default' | 'accent';
}) {
  return (
    <div
      className={cn(
        'rounded-[1.4rem] border p-4 shadow-sm',
        emphasis === 'accent'
          ? 'border-mcm-walnut bg-[linear-gradient(135deg,rgba(255,247,233,0.98),rgba(225,173,1,0.16))]'
          : 'border-mcm-walnut/25 bg-mcm-paper/85'
      )}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 font-display text-2xl tracking-[0.04em] text-foreground">{value}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</div>
    </div>
  );
}
