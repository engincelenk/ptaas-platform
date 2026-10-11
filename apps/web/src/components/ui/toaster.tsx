'use client';

import * as React from 'react';
import { X } from 'lucide-react';

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

// Global toast queue
type Listener = (toasts: ToastMessage[]) => void;
let _listeners: Listener[] = [];
let _toasts: ToastMessage[] = [];
let _nextId = 1;

function push(type: ToastMessage['type'], message: string) {
  const id = _nextId++;
  _toasts = [..._toasts, { id, type, message }];
  _listeners.forEach((l) => l([..._toasts]));
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    _listeners.forEach((l) => l([..._toasts]));
  }, 4000);
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};

const TYPE_STYLES: Record<ToastMessage['type'], string> = {
  success: 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/50 dark:text-green-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100',
  info: 'border-border bg-background text-foreground',
};

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  React.useEffect(() => {
    const listener: Listener = (t) => setToasts(t);
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter((l) => l !== listener); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg text-sm ${TYPE_STYLES[t.type]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            className="shrink-0 opacity-70 hover:opacity-100"
            onClick={() => {
              _toasts = _toasts.filter((x) => x.id !== t.id);
              _listeners.forEach((l) => l([..._toasts]));
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
