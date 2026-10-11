'use client';

interface TrendPoint {
  week: string;
  newFindings: number;
  resolvedFindings: number;
}

interface Props {
  data: TrendPoint[];
}

export function OrgTrendChart({ data }: Props) {
  const W = 600; const H = 160;
  const PAD = { top: 12, right: 16, bottom: 28, left: 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.flatMap((d) => [d.newFindings, d.resolvedFindings]), 1);
  const xStep = cW / Math.max(data.length - 1, 1);

  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (v: number) => PAD.top + cH - (v / maxVal) * cH;

  const polyline = (key: 'newFindings' | 'resolvedFindings') =>
    data.map((d, i) => `${toX(i)},${toY(d[key])}`).join(' ');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PAD.top + cH * (1 - f),
    label: Math.round(maxVal * f),
  }));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {gridLines.map(({ y, label }) => (
          <g key={y}>
            <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{label}</text>
          </g>
        ))}

        {/* X labels — every 2nd week */}
        {data.map((d, i) =>
          i % 2 === 0 ? (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="#9ca3af">
              {d.week.slice(5)}
            </text>
          ) : null,
        )}

        {/* Lines */}
        <polyline points={polyline('newFindings')} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinejoin="round" />
        <polyline points={polyline('resolvedFindings')} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" />

        {/* Dots */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(d.newFindings)} r={3} fill="#ef4444" />
            <circle cx={toX(i)} cy={toY(d.resolvedFindings)} r={3} fill="#22c55e" />
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-1 justify-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 inline-block" />New findings</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500 inline-block" />Resolved</span>
      </div>
    </div>
  );
}
