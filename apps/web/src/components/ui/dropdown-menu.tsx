'use client';

import * as React from 'react';

interface DropdownContextValue {
  open: boolean;
  setOpen: (o: boolean) => void;
}
const DropdownContext = React.createContext<DropdownContextValue>({ open: false, setOpen: () => {} });

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({ asChild, children, ...props }: { asChild?: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = React.useContext(DropdownContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); setOpen(!open); },
    });
  }
  return (
    <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }} {...props}>
      {children}
    </div>
  );
}

export function DropdownMenuContent({ className = '', align = 'start', children, ...props }: { align?: 'start' | 'end' | 'center'; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const { open } = React.useContext(DropdownContext);
  if (!open) return null;

  const alignClass = align === 'end' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';

  return (
    <div
      className={`absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md mt-1 ${alignClass} ${className}`}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({ className = '', onClick, asChild, children, ...props }: { asChild?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const { setOpen } = React.useContext(DropdownContext);
  const classes = `relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${className}`;

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
    return React.cloneElement(child, {
      role: 'menuitem',
      className: `${classes} ${child.props.className ?? ''}`,
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        child.props.onClick?.(e);
        onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
        setOpen(false);
      },
    });
  }

  return (
    <div
      role="menuitem"
      className={classes}
      onClick={(e) => { onClick?.(e); setOpen(false); }}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className = '' }: { className?: string }) {
  return <div className={`-mx-1 my-1 h-px bg-border ${className}`} />;
}

export function DropdownMenuLabel({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-2 py-1.5 text-xs font-semibold text-muted-foreground ${className}`} {...props} />;
}
