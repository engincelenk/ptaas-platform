import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { EnrichmentModule } from './enrichment.module';

describe('EnrichmentModule', () => {
  it('only exports providers/modules it actually owns (string tokens broke application boot)', () => {
    const exported = Reflect.getMetadata('exports', EnrichmentModule) as unknown[];
    expect(exported.length).toBeGreaterThan(0);
    for (const e of exported) expect(typeof e, String(e)).not.toBe('string');
  });
});
