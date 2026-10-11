'use client';

interface OwaspBar {
  owasp: string;
  count: number;
}

export function OwaspHeatmap({ data }: { data: OwaspBar[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  const color = (count: number) => {
    const ratio = count / max;
    if (ratio >= 0.75) return 'bg-red-500';
    if (ratio >= 0.5)  return 'bg-orange-400';
    if (ratio >= 0.25) return 'bg-yellow-400';
    return 'bg-blue-300';
  };

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.owasp} className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">
            {d.owasp.split('–')[0]?.trim() ?? d.owasp}
          </span>
          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
            <div
              className={`h-full rounded transition-all ${color(d.count)}`}
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold w-8 text-right">{d.count}</span>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No OWASP data yet</p>
      )}
    </div>
  );
}
