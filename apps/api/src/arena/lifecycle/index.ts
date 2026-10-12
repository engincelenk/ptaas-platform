import type { Provider, Type } from '@nestjs/common';

/** Owned by the lifecycle agent: controllers + providers for targets, runs, RoE, approval, SSE. */
export const LIFECYCLE_CONTROLLERS: Type<unknown>[] = [];
export const LIFECYCLE_PROVIDERS: Provider[] = [];
