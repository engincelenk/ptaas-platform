import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AuditModule } from './audit.module';

describe('AuditModule', () => {
  it('is global so every feature module can inject AuditService (application boot regression)', () => {
    expect(Reflect.getMetadata('__module:global__', AuditModule)).toBe(true);
  });
});
