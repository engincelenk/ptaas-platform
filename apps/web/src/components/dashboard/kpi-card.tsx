interface KpiCardProps {
  label: string;
  value: number | string | null;
  sub?: string;
  color?: 'default' | 'red' | 'orange' | 'green' | 'blue';
}

const COLOR_MAP = {
  default: 'text-foreground',
  red:     'text-red-600 dark:text-red-400',
  orange:  'text-orange-600 dark:text-orange-400',
  green:   'text-green-600 dark:text-green-400',
  blue:    'text-blue-600 dark:text-blue-400',
};

export function KpiCard({ label, value, sub, color = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-3xl font-bold leading-none ${COLOR_MAP[color]}`}>
        {value ?? '—'}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
