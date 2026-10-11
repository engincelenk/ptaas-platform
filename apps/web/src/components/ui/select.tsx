'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectContextValue {
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  disabled?: boolean;
}
const SelectContext = React.createContext<SelectContextValue>({
  value: '', onValueChange: () => {}, open: false, setOpen: () => {},
});

export function Select({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  disabled = false,
  children,
}: {
  disabled?: boolean;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
}) {
  const [internal, setInternal] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const value = controlledValue !== undefined ? controlledValue : internal;
  const handleChange = (v: string) => { setInternal(v); onValueChange?.(v); setOpen(false); };

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleChange, open: open && !disabled, setOpen, disabled }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen, disabled } = React.useContext(SelectContext);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = React.useContext(SelectContext);
  const [label, setLabel] = React.useState<string>('');

  return <span className={label || value ? '' : 'text-muted-foreground'}>{label || value || placeholder}</span>;
}

export function SelectContent({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = React.useContext(SelectContext);
  if (!open) return null;
  return (
    <div
      className={`absolute z-50 min-w-full mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 ${className}`}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      <div className="p-1">{children}</div>
    </div>
  );
}

export function SelectItem({ value, className = '', children, ...props }: { value: string; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(SelectContext);
  const isSelected = ctx.value === value;
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={() => ctx.onValueChange(value)}
      className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${isSelected ? 'font-medium bg-accent/50' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
