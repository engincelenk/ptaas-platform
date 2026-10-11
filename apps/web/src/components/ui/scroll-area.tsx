import * as React from 'react';

export const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`relative overflow-y-auto ${className}`} {...props} />
  ),
);
ScrollArea.displayName = 'ScrollArea';
