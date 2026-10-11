'use client';

interface PdfRingProgressProps {
  progress: number; // 0–100
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function PdfRingProgress({
  progress,
  size = 64,
  strokeWidth = 5,
  label = 'PDF-Fortschritt',
}: PdfRingProgressProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;
  const done = progress >= 100;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={strokeWidth}
      />

      {done ? (
        /* Checkmark on completion */
        <>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(142 71% 45%)" strokeWidth={strokeWidth} />
          <polyline
            points={`${cx - r * 0.35},${cy} ${cx - r * 0.1},${cy + r * 0.3} ${cx + r * 0.4},${cy - r * 0.3}`}
            fill="none"
            stroke="hsl(142 71% 45%)"
            strokeWidth={strokeWidth * 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        /* Progress ring */
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      )}

      {!done && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground font-semibold"
          fontSize={size * 0.22}
        >
          {Math.round(progress)}%
        </text>
      )}
    </svg>
  );
}
