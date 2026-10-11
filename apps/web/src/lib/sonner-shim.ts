// Shim for 'sonner' — re-exports our custom toast implementation so no npm package is needed.
export { toast } from '@/components/ui/toaster';

// Named export for <Toaster /> usage (some files import it from sonner directly)
export { Toaster } from '@/components/ui/toaster';
