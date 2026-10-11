'use client';

import * as React from 'react';

interface AlertDialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}
const AlertDialogContext = React.createContext<AlertDialogContextValue>({ open: false, setOpen: () => {} });

export function AlertDialog({ open: controlledOpen, onOpenChange, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; children: React.ReactNode }) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  return <AlertDialogContext.Provider value={{ open, setOpen }}>{children}</AlertDialogContext.Provider>;
}

export function AlertDialogTrigger({
  asChild,
  children,
  onClick,
  ...props
}: { asChild?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = React.useContext(AlertDialogContext);

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        child.props.onClick?.(e);
        setOpen(true);
      },
    });
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        onClick?.(e);
        setOpen(true);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function AlertDialogContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = React.useContext(AlertDialogContext);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className={`relative z-50 grid w-full max-w-lg gap-4 rounded-xl border border-border bg-background p-6 shadow-lg mx-4 ${className}`} {...props} />
    </div>
  );
}

export function AlertDialogHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col space-y-2 ${className}`} {...props} />;
}

export function AlertDialogTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`text-lg font-semibold ${className}`} {...props} />;
}

export function AlertDialogDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm text-muted-foreground ${className}`} {...props} />;
}

export function AlertDialogFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`} {...props} />;
}

export function AlertDialogCancel({ className = '', children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = React.useContext(AlertDialogContext);
  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent transition-colors ${className}`}
      {...props}
      onClick={(e) => { onClick?.(e); setOpen(false); }}
    >
      {children ?? 'Cancel'}
    </button>
  );
}

export function AlertDialogAction({ className = '', children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = React.useContext(AlertDialogContext);
  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-md bg-primary text-primary-foreground px-4 text-sm font-medium hover:opacity-90 transition-opacity ${className}`}
      {...props}
      onClick={(e) => { onClick?.(e); setOpen(false); }}
    >
      {children ?? 'Continue'}
    </button>
  );
}
