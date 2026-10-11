'use client';

import { useMemo } from 'react';

interface WeekBucket {
  week: string;
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  INFO: number;
  total: number;
}

interface TrendChartProps {
  weeks: WeekBucket[];
}

const COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
  INFO: '#6b7280',
} as const;

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export function TrendChart({ weeks }: TrendChartProps) {
  const W = 600;
  const H = 180;
  const PAD = { top: 16, right: 16, bottom: 32, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = useMemo(() => Math.max(1, ...weeks.map((w) => w.total)), [weeks]);
  const n = weeks.length;

  const xPos = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * chartW;
  const yPos = (v: number) => PAD.top + chartH - (v / maxVal) * chartH;

  const line = (sev: keyof typeof COLORS) =>
    weeks
      .map((w, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos((w as any)[sev]).toFixed(1)}`)
      .join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.top + chartH * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="currentColor" strokeOpacity={0.08} />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>
                {Math.round(maxVal * t)}
              </text>
            </g>
          );
        })}

        {/* Severity lines */}
        {SEVERITIES.map((sev) => (
          <path
            key={sev}
            d={line(sev)}
            fill="none"
            stroke={COLORS[sev]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* X-axis labels — every 4 weeks */}
        {weeks.map((w, i) => {
          if (i % 4 !== 0) return null;
          return (
            <text
              key={w.week}
              x={xPos(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.5}
            >
              {w.week.slice(5)}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2 flex-wrap">
        {SEVERITIES.map((sev) => (
          <div key={sev} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: COLORS[sev] }} />
            {sev}
          </div>
        ))}
      </div>
    </div>
  );
}
