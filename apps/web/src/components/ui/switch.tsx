'use client';

import * as React from 'react';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Switch({ checked, defaultChecked, onCheckedChange, disabled, id, className = '' }: SwitchProps) {
  const [internal, setInternal] = React.useState(defaultChecked ?? false);
  const isChecked = checked !== undefined ? checked : internal;

  return (
    <button
      role="switch"
      id={id}
      aria-checked={isChecked}
      disabled={disabled}
      onClick={() => {
        const next = !isChecked;
        setInternal(next);
        onCheckedChange?.(next);
      }}
      className={`peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${isChecked ? 'bg-primary' : 'bg-input'} ${className}`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${isChecked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}
