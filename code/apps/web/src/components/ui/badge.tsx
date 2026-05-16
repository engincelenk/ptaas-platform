import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        {
          'bg-primary/10 text-primary': variant === 'default',
          'bg-secondary text-secondary-foreground': variant === 'secondary',
          'bg-destructive/10 text-destructive': variant === 'destructive',
          'border border-border text-muted-foreground': variant === 'outline',
        },
        className,
      )}
    >
      {children}
    </span>
  );
}
