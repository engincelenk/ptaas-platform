'use client';

interface HealthPoint {
  isUp: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  checkedAt: string;
}

interface Props {
  data: HealthPoint[];
}

export function ResponseTimeChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">No health data yet</p>;
  }

  const W = 600; const H = 140;
  const PAD = { top: 12, right: 16, bottom: 28, left: 40 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const upPoints = data.filter((d) => d.isUp && d.responseTimeMs != null);
  const maxMs = Math.max(...upPoints.map((d) => d.responseTimeMs!), 500);
  const xStep = cW / Math.max(data.length - 1, 1);

  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (ms: number) => PAD.top + cH - (ms / maxMs) * cH;

  // Grid lines
  const gridVals = [0, Math.round(maxMs * 0.5), maxMs];

  // Build polyline only for consecutive up points
  const segments: Array<Array<{ x: number; y: number; i: number }>> = [];
  let seg: Array<{ x: number; y: number; i: number }> = [];
  data.forEach((d, i) => {
    if (d.isUp && d.responseTimeMs != null) {
      seg.push({ x: toX(i), y: toY(d.responseTimeMs), i });
    } else {
      if (seg.length > 1) segments.push(seg);
      seg = [];
    }
  });
  if (seg.length > 1) segments.push(seg);

  // X-axis labels — every ~6th point
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data
    .map((d, i) => ({ i, label: new Date(d.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }))
    .filter((_, i) => i % step === 0);

  // Uptime %
  const uptimePct = data.length === 0 ? 100 : Math.round((data.filter((d) => d.isUp).length / data.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Response time (ms) — last 24h</span>
        <span className={`font-semibold ${uptimePct >= 99 ? 'text-green-600' : uptimePct >= 95 ? 'text-orange-600' : 'text-red-600'}`}>
          {uptimePct}% uptime
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36" preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {gridVals.map((v) => {
            const y = v === 0 ? PAD.top + cH : toY(v);
            return (
              <g key={v}>
                <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 2" />
                <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={8} fill="#9ca3af">{v}</text>
              </g>
            );
          })}

          {/* Down markers */}
          {data.map((d, i) =>
            !d.isUp ? (
              <rect key={i} x={toX(i) - 2} y={PAD.top} width={4} height={cH} fill="#fee2e2" opacity={0.7} />
            ) : null,
          )}

          {/* Response time lines */}
          {segments.map((seg, si) => (
            <polyline
              key={si}
              points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}

          {/* Dots */}
          {data.map((d, i) =>
            d.isUp && d.responseTimeMs != null ? (
              <circle key={i} cx={toX(i)} cy={toY(d.responseTimeMs)} r={2.5} fill="#22c55e" />
            ) : !d.isUp ? (
              <line key={i} x1={toX(i)} y1={PAD.top + 4} x2={toX(i)} y2={PAD.top + cH - 4} stroke="#ef4444" strokeWidth={1.5} />
            ) : null,
          )}

          {/* X labels */}
          {xLabels.map(({ i, label }) => (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{label}</text>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground justify-center">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500 inline-block" />Response time (ms)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block" />Down</span>
      </div>
    </div>
  );
}
