'use client';

import { useEffect, useState } from 'react';

type Phase = 'loading' | 'streaming' | 'complete';

interface AiSkeletonProps {
  phase: Phase;
  content?: string;
}

export function AiSkeleton({ phase, content }: AiSkeletonProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (phase !== 'loading') return;
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'complete' && content) {
    return (
      <div className="rounded-lg border bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800 p-4 text-sm leading-relaxed">
        {content}
      </div>
    );
  }

  if (phase === 'streaming') {
    return (
      <div className="rounded-lg border bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800 p-4 text-sm leading-relaxed">
        {content ?? ''}
        <span
          className="inline-block w-0.5 h-4 bg-violet-500 ml-0.5 align-text-bottom animate-[blink_0.8s_step-end_infinite]"
          aria-hidden="true"
        />
      </div>
    );
  }

  // loading phase — shimmer skeleton
  return (
    <div
      className="rounded-lg border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 p-4 space-y-2"
      role="status"
      aria-label={`KI-Analyse wird geladen${dots}`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-4 w-4 rounded-full bg-violet-300 dark:bg-violet-700 animate-pulse" />
        <div className="h-3 w-28 rounded bg-violet-200 dark:bg-violet-800 animate-pulse" />
      </div>
      {[100, 90, 75].map((w, i) => (
        <div
          key={i}
          className="h-3 rounded bg-violet-100 dark:bg-violet-900/50 animate-[shimmer_1.5s_ease-in-out_infinite]"
          style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <span className="sr-only">KI-Analyse wird geladen{dots}</span>
    </div>
  );
}
